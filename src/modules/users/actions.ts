"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { normalizeEmail } from "@/lib/normalize";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { hashPassword, verifyPassword } from "@/modules/auth/hash";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { assertOwnerProtection } from "./owner-guard";
import {
  adminSetPasswordSchema,
  changeOwnPasswordSchema,
  createUserFormSchema,
  updateUserFormSchema,
} from "@/validations/user";

export type UserActionState = { error: string | null };

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function createUserAction(
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actingUser = await requireUser();
  requirePermission(actingUser, "USER_MANAGE");

  const parsed = createUserFormSchema.safeParse({
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    email: str(formData, "email"),
    role: str(formData, "role"),
    password: str(formData, "password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;
  const emailNormalized = normalizeEmail(data.email);
  // Passwort wird ausschließlich gehasht weiterverarbeitet - der
  // Klartext erreicht nie ein Log, eine Activity oder einen AuditLog-Eintrag.
  const passwordHash = await hashPassword(data.password);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: emailNormalized,
          passwordHash,
          role: data.role,
        },
      });

      await writeCrmAuditLog(tx, {
        action: "USER_CREATED",
        userId: actingUser.id,
        entityType: "User",
        entityId: user.id,
        metadata: { role: data.role },
      });
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { error: "Diese E-Mail-Adresse wird bereits verwendet." };
    }
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Benutzer konnte nicht angelegt werden." };
  }

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function updateUserAction(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actingUser = await requireUser();
  requirePermission(actingUser, "USER_MANAGE");

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { error: "Benutzer wurde nicht gefunden." };
  }

  const parsed = updateUserFormSchema.safeParse({
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    email: str(formData, "email"),
    role: str(formData, "role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;
  const emailNormalized = normalizeEmail(data.email);
  const roleChanged = existing.role !== data.role;

  try {
    await prisma.$transaction(async (tx) => {
      // OWNER-Schutz greift bei JEDER Rollenänderung, nicht nur beim
      // expliziten "Deaktivieren" - ein Herabstufen des letzten aktiven
      // OWNER via Bearbeiten-Formular ist derselbe kritische Fall.
      await assertOwnerProtection(
        tx,
        { id: existing.id, role: existing.role, isActive: existing.isActive },
        { role: data.role },
      );

      await tx.user.update({
        where: { id: userId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: emailNormalized,
          role: data.role,
        },
      });

      await writeCrmAuditLog(tx, {
        action: "USER_UPDATED",
        userId: actingUser.id,
        entityType: "User",
        entityId: userId,
      });
      if (roleChanged) {
        await writeCrmAuditLog(tx, {
          action: "USER_ROLE_CHANGED",
          userId: actingUser.id,
          entityType: "User",
          entityId: userId,
          metadata: { fromRole: existing.role, toRole: data.role },
        });
      }
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { error: "Diese E-Mail-Adresse wird bereits verwendet." };
    }
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Benutzer konnte nicht gespeichert werden." };
  }

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export type UserStatusActionResult = { success: true } | { success: false; error: string };

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<UserStatusActionResult> {
  const actingUser = await requireUser();
  requirePermission(actingUser, "USER_MANAGE");

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { success: false, error: "Benutzer wurde nicht gefunden." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await assertOwnerProtection(
        tx,
        { id: existing.id, role: existing.role, isActive: existing.isActive },
        { isActive },
      );

      await tx.user.update({ where: { id: userId }, data: { isActive } });

      await writeCrmAuditLog(tx, {
        action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        userId: actingUser.id,
        entityType: "User",
        entityId: userId,
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }

  revalidatePath("/settings/users");
  return { success: true };
}

// Administratives Zurücksetzen (siehe Vorgabe Punkt 8): OWNER/ADMIN mit
// USER_MANAGE darf für JEDEN Benutzer ein neues Passwort setzen, ohne das
// alte zu kennen oder anzuzeigen. `authVersion` wird erhöht, damit
// bestehende Sessions des betroffenen Benutzers sofort logisch ungültig
// werden (siehe src/server/rbac.ts).
export async function adminSetPasswordAction(
  userId: string,
  _previousState: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actingUser = await requireUser();
  requirePermission(actingUser, "USER_MANAGE");

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { error: "Benutzer wurde nicht gefunden." };
  }

  const parsed = adminSetPasswordSchema.safeParse({ password: str(formData, "password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte ein gültiges Passwort angeben." };
  }
  const passwordHash = await hashPassword(parsed.data.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await writeCrmAuditLog(tx, {
      action: "USER_PASSWORD_RESET",
      userId: actingUser.id,
      entityType: "User",
      entityId: userId,
    });
  });

  revalidatePath(`/settings/users/${userId}/edit`);
  return { error: null };
}

export type ChangeOwnPasswordState = { error: string | null; success: boolean };

// Eigenes Passwort ändern (siehe Vorgabe Punkt 8): jeder authentifizierte
// Benutzer, unabhängig von Admin-Permissions - verlangt das aktuelle
// Passwort zur Verifikation. Erhöht ebenfalls `authVersion`, damit andere
// aktive Sessions desselben Benutzers (z. B. ein zweites Gerät) nach
// einer sicherheitskritischen Änderung nicht einfach weiterlaufen.
export async function changeOwnPasswordAction(
  _previousState: ChangeOwnPasswordState,
  formData: FormData,
): Promise<ChangeOwnPasswordState> {
  const actingUser = await requireUser();

  const parsed = changeOwnPasswordSchema.safeParse({
    currentPassword: str(formData, "currentPassword"),
    newPassword: str(formData, "newPassword"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen.",
      success: false,
    };
  }

  const isCurrentPasswordValid = await verifyPassword(
    parsed.data.currentPassword,
    actingUser.passwordHash,
  );
  if (!isCurrentPasswordValid) {
    return { error: "Das aktuelle Passwort ist nicht korrekt.", success: false };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actingUser.id },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await writeCrmAuditLog(tx, {
      action: "USER_PASSWORD_CHANGED",
      userId: actingUser.id,
      entityType: "User",
      entityId: actingUser.id,
    });
  });

  return { error: null, success: true };
}
