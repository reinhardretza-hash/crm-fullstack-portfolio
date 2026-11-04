"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { strictBerlinTimeToUtc } from "@/lib/timezone";
import { requireUser } from "@/server/rbac";
import { logActivity } from "@/modules/activity/log";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { callLogSchema } from "@/validations/call";

export type CallLogState = { error: string | null; saved?: boolean };

// Anruf dokumentieren = eine Activity (CALL_LOGGED) + Audit. Keine neue
// Tabelle, keine Telefonie-Integration. Das optionale Follow-up-Datum wird nur
// gesetzt, wenn der Deal EINDEUTIG einen Lead hat (gleiche Änderung wie
// setLeadFollowUpAction inkl. LEAD_FOLLOW_UP_CHANGED-Activity).
export async function logCallAction(
  _previous: CallLogState,
  formData: FormData,
): Promise<CallLogState> {
  const user = await requireUser();
  const get = (key: string) => formData.get(key) ?? undefined;
  const parsed = callLogSchema.safeParse({
    companyId: get("companyId"),
    contactId: get("contactId"),
    dealId: get("dealId"),
    outcome: get("outcome"),
    note: get("note"),
    durationMinutes: get("durationMinutes"),
    nextStep: get("nextStep"),
    followUpDate: get("followUpDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const input = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      let companyId: string | undefined;
      let contactId: string | undefined;
      let dealId: string | undefined;
      let leadId: string | null = null;
      let entityType: "Company" | "Contact" | "Deal";
      let entityId: string;

      if (input.dealId) {
        const deal = await tx.deal.findFirst({
          where: { id: input.dealId, deletedAt: null },
          select: { id: true, companyId: true, contactId: true, leadId: true },
        });
        if (!deal) throw new AppError("Der Deal wurde nicht gefunden oder ist gelöscht.");
        dealId = deal.id;
        companyId = deal.companyId;
        contactId = deal.contactId ?? undefined;
        leadId = deal.leadId;
        entityType = "Deal";
        entityId = deal.id;
      } else if (input.contactId) {
        const contact = await tx.contact.findFirst({
          where: { id: input.contactId, deletedAt: null },
          select: { id: true, companyId: true },
        });
        if (!contact) throw new AppError("Der Kontakt wurde nicht gefunden oder ist gelöscht.");
        contactId = contact.id;
        companyId = contact.companyId ?? undefined;
        entityType = "Contact";
        entityId = contact.id;
      } else {
        const company = await tx.company.findFirst({
          where: { id: input.companyId, deletedAt: null },
          select: { id: true },
        });
        if (!company) throw new AppError("Das Unternehmen wurde nicht gefunden oder ist gelöscht.");
        companyId = company.id;
        entityType = "Company";
        entityId = company.id;
      }

      await logActivity(tx, {
        type: "CALL_LOGGED",
        userId: user.id,
        companyId,
        contactId,
        dealId,
        metadata: {
          callOutcome: input.outcome,
          ...(input.durationMinutes ? { durationMinutes: input.durationMinutes } : {}),
          ...(input.note ? { callNote: input.note } : {}),
          ...(input.nextStep ? { nextStep: input.nextStep } : {}),
        },
      });

      if (input.followUpDate) {
        if (!leadId) throw new AppError("Für ein Follow-up wird ein verknüpfter Lead benötigt.");
        const lead = await tx.lead.findFirst({
          where: { id: leadId, deletedAt: null },
          select: { nextFollowUpAt: true },
        });
        if (!lead) throw new AppError("Der verknüpfte Lead wurde nicht gefunden.");
        const next = strictBerlinTimeToUtc(input.followUpDate, "09:00");
        await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: next } });
        await logActivity(tx, {
          type: "LEAD_FOLLOW_UP_CHANGED",
          userId: user.id,
          leadId,
          metadata: {
            oldFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
            newFollowUpAt: next.toISOString(),
          },
        });
      }

      // Audit nur mit Metadaten (Ergebnis/Dauer), kein Notizinhalt.
      await writeCrmAuditLog(tx, {
        action: "CALL_LOGGED",
        userId: user.id,
        entityType,
        entityId,
        metadata: { outcome: input.outcome, durationMinutes: input.durationMinutes ?? null },
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Der Anruf konnte nicht gespeichert werden." };
  }

  if (input.companyId) revalidatePath(`/companies/${input.companyId}`);
  if (input.contactId) revalidatePath(`/contacts/${input.contactId}`);
  if (input.dealId) revalidatePath(`/deals/${input.dealId}`);
  return { error: null, saved: true };
}
