import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { resolveQuoteContext } from "@/modules/quotes/context";
import { mergeEmailContext } from "@/modules/email/context";
export async function resolveInvoiceContext(
  tx: Prisma.TransactionClient,
  input: { quoteId?: string; companyId: string; contactId?: string; dealId?: string },
) {
  const quote = input.quoteId
    ? await tx.quote.findFirst({
        where: { id: input.quoteId, deletedAt: null, status: "ACCEPTED" },
        include: { items: { orderBy: { position: "asc" } } },
      })
    : null;
  if (input.quoteId && !quote)
    throw new AppError("Nur angenommene, vorhandene Angebote können eine Rechnung erzeugen.");
  const context = quote
    ? mergeEmailContext(input, {
        companyId: quote.companyId,
        contactId: quote.contactId || undefined,
        dealId: quote.dealId || undefined,
      })
    : input;
  const resolved = await resolveQuoteContext(tx, {
    companyId: input.companyId,
    contactId: context.contactId,
    dealId: context.dealId,
  });
  return { ...resolved, quote };
}
