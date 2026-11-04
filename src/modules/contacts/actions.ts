"use server";

import { AppError } from "@/lib/errors";
import { entityIdSchema } from "@/validations/entity";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeLinkedinUrl, normalizePhone } from "@/lib/normalize";
import { requireUser } from "@/server/rbac";
import { contactFormSchema } from "@/validations/contact";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { logActivity } from "@/modules/activity/log";
import { resolveTagIds } from "@/modules/tags/service";

export type ContactActionState = {
  error: string | null;
};

// Siehe companies/actions.ts: `FormData.get()` liefert `null` für Felder,
// die im Formular gar nicht vorkommen - unsere Zod-Schemas akzeptieren nur
// `string | undefined`, nie `null`.
function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseFormData(formData: FormData) {
  return {
    firstName: str(formData, "firstName"),
    lastName: str(formData, "lastName"),
    jobTitle: str(formData, "jobTitle"),
    companyId: str(formData, "companyId"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    mobile: str(formData, "mobile"),
    linkedinUrl: str(formData, "linkedinUrl"),
    website: str(formData, "website"),
    source: str(formData, "source") || undefined,
    status: str(formData, "status") || undefined,
    assignedUserId: str(formData, "assignedUserId"),
    tags: formData
      .getAll("tags")
      .flatMap((value) => String(value).split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

function normalizedFields(data: {
  email?: string;
  phone?: string;
  mobile?: string;
  linkedinUrl?: string;
}) {
  return {
    emailNormalized: data.email ? normalizeEmail(data.email) : undefined,
    phoneNormalized: data.phone ? normalizePhone(data.phone) : undefined,
    mobileNormalized: data.mobile ? normalizePhone(data.mobile) : undefined,
    linkedinNormalized: data.linkedinUrl ? safeNormalizeLinkedin(data.linkedinUrl) : undefined,
  };
}

export async function createContactAction(
  _previousState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await requireUser();

  const parsed = contactFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }

  const data = parsed.data;

  let contactId: string;
  try {
    contactId = await prisma.$transaction(async (tx) => {
      const tagIds = await resolveTagIds(tx, data.tags);

      const contact = await tx.contact.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          jobTitle: data.jobTitle,
          companyId: data.companyId || null,
          email: data.email,
          phone: data.phone,
          mobile: data.mobile,
          linkedinUrl: data.linkedinUrl,
          website: data.website,
          source: data.source,
          status: data.status,
          assignedUserId: data.assignedUserId || null,
          ...normalizedFields(data),
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
        },
      });

      await logActivity(tx, { type: "CONTACT_CREATED", userId: user.id, contactId: contact.id });
      await writeCrmAuditLog(tx, {
        action: "CONTACT_CREATED",
        userId: user.id,
        entityType: "Contact",
        entityId: contact.id,
      });

      return contact.id;
    });
  } catch {
    return { error: "Kontakt konnte nicht gespeichert werden." };
  }

  redirect(`/contacts/${contactId}`);
}

export async function updateContactAction(
  contactId: string,
  _previousState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const user = await requireUser();

  const existing = await prisma.contact.findFirst({ where: { id: contactId, deletedAt: null } });
  if (!existing) {
    return { error: "Kontakt wurde nicht gefunden." };
  }

  const parsed = contactFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const tagIds = await resolveTagIds(tx, data.tags);

      await tx.contact.update({
        where: { id: contactId },
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          jobTitle: data.jobTitle,
          companyId: data.companyId || null,
          email: data.email,
          phone: data.phone,
          mobile: data.mobile,
          linkedinUrl: data.linkedinUrl,
          website: data.website,
          source: data.source,
          status: data.status,
          assignedUserId: data.assignedUserId || null,
          ...normalizedFields(data),
          tags: {
            deleteMany: {},
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
      });

      await logActivity(tx, { type: "CONTACT_UPDATED", userId: user.id, contactId });
      await writeCrmAuditLog(tx, {
        action: "CONTACT_UPDATED",
        userId: user.id,
        entityType: "Contact",
        entityId: contactId,
      });
    });
  } catch {
    return { error: "Kontakt konnte nicht gespeichert werden." };
  }

  redirect(`/contacts/${contactId}`);
}

// Atomisches Soft Delete ohne Löschung historischer Beziehungen.
export async function deleteContactAction(contactId: string): Promise<void> {
  const user = await requireUser();
  entityIdSchema.parse(contactId);

  await prisma.$transaction(async (tx) => {
    const changed = await tx.contact.updateMany({
      where: { id: contactId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (changed.count !== 1)
      throw new AppError("Datensatz wurde nicht gefunden oder bereits gelöscht.");
    await writeCrmAuditLog(tx, {
      action: "CONTACT_DELETED",
      userId: user.id,
      entityType: "Contact",
      entityId: contactId,
    });
  });
  revalidatePath("/contacts");
  revalidatePath("/companies");
  revalidatePath("/dashboard");
}

export async function deleteContactFromDetailAction(
  contactId: string,
): Promise<ContactActionState> {
  try {
    await deleteContactAction(contactId);
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    throw error;
  }
  redirect("/contacts?deleted=1");
}

function safeNormalizeLinkedin(url: string): string | undefined {
  try {
    return normalizeLinkedinUrl(url);
  } catch {
    return undefined;
  }
}
