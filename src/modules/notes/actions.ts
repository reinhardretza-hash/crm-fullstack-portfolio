"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { noteFormSchema } from "@/validations/note";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { logActivity } from "@/modules/activity/log";
import { AppError } from "@/lib/errors";

export type NoteActionState = {
  error: string | null;
};

export async function addNoteAction(
  _previousState: NoteActionState,
  formData: FormData,
): Promise<NoteActionState> {
  const user = await requireUser();

  const parsed = noteFormSchema.safeParse({
    content: formData.get("content"),
    companyId: formData.get("companyId") || undefined,
    contactId: formData.get("contactId") || undefined,
    leadId: formData.get("leadId") || undefined,
    dealId: formData.get("dealId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Notiz prüfen." };
  }

  const { content, companyId, contactId, leadId, dealId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const target = companyId
        ? await tx.company.findFirst({ where: { id: companyId, deletedAt: null } })
        : contactId
          ? await tx.contact.findFirst({ where: { id: contactId, deletedAt: null } })
          : leadId
            ? await tx.lead.findFirst({ where: { id: leadId, deletedAt: null } })
            : await tx.deal.findFirst({ where: { id: dealId, deletedAt: null } });
      if (!target) throw new AppError("Notiz-Ziel wurde nicht gefunden oder gelöscht.");
      const note = await tx.note.create({
        data: { content, authorId: user.id, companyId, contactId, leadId, dealId },
      });

      await logActivity(tx, {
        type: "NOTE_ADDED",
        userId: user.id,
        companyId: companyId ?? undefined,
        contactId: contactId ?? undefined,
        leadId: leadId ?? undefined,
        dealId: dealId ?? undefined,
      });
      await writeCrmAuditLog(tx, {
        action: "NOTE_CREATED",
        userId: user.id,
        entityType: "Note",
        entityId: note.id,
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Notiz konnte nicht gespeichert werden." };
  }

  if (companyId) revalidatePath(`/companies/${companyId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
  if (dealId) revalidatePath(`/deals/${dealId}`);

  return { error: null };
}
