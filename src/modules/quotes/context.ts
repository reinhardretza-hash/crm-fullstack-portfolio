import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { mergeEmailContext } from "@/modules/email/context";
export async function resolveQuoteContext(
  tx: Prisma.TransactionClient,
  input: { companyId: string; contactId?: string; dealId?: string },
) {
  let context = { ...input };
  const deal = input.dealId
    ? await tx.deal.findFirst({ where: { id: input.dealId, deletedAt: null } })
    : null;
  if (input.dealId && !deal) throw new AppError("Deal wurde nicht gefunden.");
  if (deal)
    context = {
      ...context,
      ...mergeEmailContext(context, {
        companyId: deal.companyId,
        contactId: deal.contactId || undefined,
      }),
    };
  const company = await tx.company.findFirst({ where: { id: context.companyId, deletedAt: null } });
  if (!company) throw new AppError("Bitte ein vorhandenes Unternehmen auswählen.");
  const contact = context.contactId
    ? await tx.contact.findFirst({ where: { id: context.contactId, deletedAt: null } })
    : null;
  if (context.contactId && !contact) throw new AppError("Kontakt wurde nicht gefunden.");
  if (contact) mergeEmailContext(context, { companyId: contact.companyId || undefined });
  return { context, company, contact, deal };
}
