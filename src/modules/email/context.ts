import type { Prisma } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import type { EmailContext } from "@/validations/email";

// Beziehungen werden aus allen ausgewählten Datensätzen zusammengeführt.
// null ist kein Widerspruch; zwei unterschiedliche bekannte IDs sind es.
export function mergeEmailContext(current: EmailContext, related: EmailContext): EmailContext {
  const merged = { ...current };
  for (const key of ["contactId", "companyId", "leadId", "dealId"] as const) {
    if (current[key] && related[key] && current[key] !== related[key])
      throw new ValidationError("Die ausgewählten CRM-Datensätze gehören nicht zusammen.");
    merged[key] = current[key] || related[key];
  }
  return merged;
}
export async function resolveEmailContext(tx: Prisma.TransactionClient, input: EmailContext) {
  let context = { ...input };
  const deal = context.dealId
    ? await tx.deal.findFirst({
        where: { id: context.dealId, deletedAt: null },
        select: { id: true, name: true, companyId: true, contactId: true, leadId: true },
      })
    : null;
  if (context.dealId && !deal)
    throw new ValidationError("Deal wurde nicht gefunden oder ist gelöscht.");
  if (deal)
    context = mergeEmailContext(context, {
      companyId: deal.companyId,
      contactId: deal.contactId || undefined,
      leadId: deal.leadId || undefined,
    });
  const lead = context.leadId
    ? await tx.lead.findFirst({
        where: { id: context.leadId, deletedAt: null },
        select: { id: true, title: true, companyId: true, contactId: true },
      })
    : null;
  if (context.leadId && !lead)
    throw new ValidationError("Lead wurde nicht gefunden oder ist gelöscht.");
  if (lead)
    context = mergeEmailContext(context, {
      companyId: lead.companyId || undefined,
      contactId: lead.contactId || undefined,
    });
  const contact = context.contactId
    ? await tx.contact.findFirst({
        where: { id: context.contactId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true, email: true, companyId: true },
      })
    : null;
  if (context.contactId && !contact)
    throw new ValidationError("Kontakt wurde nicht gefunden oder ist gelöscht.");
  if (contact) context = mergeEmailContext(context, { companyId: contact.companyId || undefined });
  const company = context.companyId
    ? await tx.company.findFirst({
        where: { id: context.companyId, deletedAt: null },
        select: { id: true, name: true },
      })
    : null;
  if (context.companyId && !company)
    throw new ValidationError("Unternehmen wurde nicht gefunden oder ist gelöscht.");
  return { context, contact, company, lead, deal };
}
