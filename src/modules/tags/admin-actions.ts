"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { normalizeTagName } from "@/lib/normalize";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { createTagFormSchema, renameTagFormSchema } from "@/validations/tag";

export type TagActionState = { error: string | null };
export type TagDeleteResult = { success: true } | { success: false; error: string };

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function createTagAction(
  _previousState: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const user = await requireUser();
  requirePermission(user, "TAG_MANAGE");

  const parsed = createTagFormSchema.safeParse({ name: str(formData, "name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte einen Namen angeben." };
  }
  const normalizedName = normalizeTagName(parsed.data.name);

  try {
    await prisma.$transaction(async (tx) => {
      const tag = await tx.tag.create({
        data: { name: parsed.data.name, normalizedName },
      });
      await writeCrmAuditLog(tx, {
        action: "TAG_CREATED",
        userId: user.id,
        entityType: "Tag",
        entityId: tag.id,
      });
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return { error: "Ein Tag mit diesem Namen existiert bereits." };
    }
    return { error: "Tag konnte nicht angelegt werden." };
  }

  revalidatePath("/settings/tags");
  return { error: null };
}

// Umbenennen kann auf den Namen eines BEREITS existierenden anderen Tags
// zielen (z. B. "Handwerk" -> "Software", wobei "Software" schon
// existiert) - siehe Vorgabe Punkt 14 "Konflikte sauber behandeln".
// Bewusste Entscheidung: statt das abzulehnen, werden die beiden Tags
// ZUSAMMENGEFÜHRT (alle Company-/Contact-Zuordnungen auf den
// Ziel-Tag übernommen, Duplikate dabei automatisch über die
// @@unique([companyId, tagId])-Constraint ignoriert, der umbenannte Tag
// anschließend gelöscht) - das entspricht der fachlichen Absicht hinter
// einer Umbenennung auf einen bereits vorhandenen Namen besser als ein
// bloßer Fehler, und verliert keine Zuordnungen.
export async function renameTagAction(
  tagId: string,
  _previousState: TagActionState,
  formData: FormData,
): Promise<TagActionState> {
  const user = await requireUser();
  requirePermission(user, "TAG_MANAGE");

  const existing = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!existing) {
    return { error: "Tag wurde nicht gefunden." };
  }

  const parsed = renameTagFormSchema.safeParse({ name: str(formData, "name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte einen Namen angeben." };
  }
  const newName = parsed.data.name;
  const normalizedName = normalizeTagName(newName);

  try {
    await prisma.$transaction(async (tx) => {
      const conflicting = await tx.tag.findUnique({ where: { normalizedName } });

      if (conflicting && conflicting.id !== tagId) {
        // Zusammenführen statt Ablehnen (siehe Begründung oben).
        const companyTags = await tx.companyTag.findMany({ where: { tagId } });
        for (const companyTag of companyTags) {
          await tx.companyTag.upsert({
            where: { companyId_tagId: { companyId: companyTag.companyId, tagId: conflicting.id } },
            update: {},
            create: { companyId: companyTag.companyId, tagId: conflicting.id },
          });
        }
        const contactTags = await tx.contactTag.findMany({ where: { tagId } });
        for (const contactTag of contactTags) {
          await tx.contactTag.upsert({
            where: { contactId_tagId: { contactId: contactTag.contactId, tagId: conflicting.id } },
            update: {},
            create: { contactId: contactTag.contactId, tagId: conflicting.id },
          });
        }
        await tx.companyTag.deleteMany({ where: { tagId } });
        await tx.contactTag.deleteMany({ where: { tagId } });
        await tx.tag.delete({ where: { id: tagId } });

        await writeCrmAuditLog(tx, {
          action: "TAG_UPDATED",
          userId: user.id,
          entityType: "Tag",
          entityId: conflicting.id,
          metadata: { mergedFromTagId: tagId, mergedFromName: existing.name },
        });
        return;
      }

      await tx.tag.update({ where: { id: tagId }, data: { name: newName, normalizedName } });
      await writeCrmAuditLog(tx, {
        action: "TAG_UPDATED",
        userId: user.id,
        entityType: "Tag",
        entityId: tagId,
        metadata: { fromName: existing.name, toName: newName },
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Tag konnte nicht umbenannt werden." };
  }

  revalidatePath("/settings/tags");
  return { error: null };
}

// Löscht nur die Zuordnungen (Company/Contact <-> Tag), niemals die
// Companies/Contacts selbst (siehe Vorgabe Punkt 15).
export async function deleteTagAction(tagId: string): Promise<TagDeleteResult> {
  const user = await requireUser();
  requirePermission(user, "TAG_MANAGE");

  const existing = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!existing) {
    return { success: false, error: "Tag wurde nicht gefunden." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.companyTag.deleteMany({ where: { tagId } });
    await tx.contactTag.deleteMany({ where: { tagId } });
    await tx.tag.delete({ where: { id: tagId } });
    await writeCrmAuditLog(tx, {
      action: "TAG_DELETED",
      userId: user.id,
      entityType: "Tag",
      entityId: tagId,
      metadata: { name: existing.name },
    });
  });

  revalidatePath("/settings/tags");
  return { success: true };
}
