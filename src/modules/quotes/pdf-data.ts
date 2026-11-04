import type { Quote, QuoteItem } from "@/generated/prisma/client";
// Explicit allowlist: no company/private metadata or internalNote in this DTO.
export function quotePdfData(quote: Quote & { items: QuoteItem[] }) {
  return {
    quoteNumber: quote.quoteNumber,
    issueDate: quote.issueDate.toISOString().slice(0, 10),
    validUntil: quote.validUntil.toISOString().slice(0, 10),
    issuerName: quote.issuerName,
    recipientName: quote.recipientName,
    recipientAddress: quote.recipientAddress,
    recipientContact: quote.recipientContact,
    currency: quote.currency,
    introText: quote.introText,
    closingText: quote.closingText,
    customerNote: quote.customerNote,
    subtotalCents: quote.subtotalCents,
    taxCents: quote.taxCents,
    totalCents: quote.totalCents,
    createdAt: quote.createdAt,
    items: quote.items.map((i) => ({
      position: i.position,
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceCents: i.unitPriceCents,
      taxRateBasisPoints: i.taxRateBasisPoints ?? quote.taxRateBasisPoints,
      lineSubtotalCents: i.lineSubtotalCents,
      lineTaxCents: i.lineTaxCents,
      lineTotalCents: i.lineTotalCents,
    })),
  };
}
export type QuotePdfData = ReturnType<typeof quotePdfData>;
