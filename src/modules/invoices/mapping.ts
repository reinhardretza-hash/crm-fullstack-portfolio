import type { Quote, QuoteItem } from "@/generated/prisma/client";
import { scaledIntegerToDecimal } from "@/lib/money";
// Independent position inputs, deliberately without QuoteItem IDs or internalNote.
export function quoteToInvoiceDefaults(quote: Quote & { items: QuoteItem[] }) {
  return {
    companyId: quote.companyId,
    contactId: quote.contactId || undefined,
    dealId: quote.dealId || undefined,
    assignedUserId: quote.assignedUserId,
    taxRateBasisPoints: String(quote.taxRateBasisPoints),
    introText: "Vielen Dank für Ihren Auftrag. Wir berechnen die folgenden Leistungen.",
    closingText: "Bitte überweisen Sie den Gesamtbetrag bis zum angegebenen Fälligkeitsdatum.",
    customerNote: quote.customerNote || "",
    items: quote.items.map((i) => ({
      title: i.title,
      description: i.description || "",
      quantity: scaledIntegerToDecimal(i.quantity, 3),
      unit: i.unit,
      unitPrice: scaledIntegerToDecimal(i.unitPriceCents, 2),
      taxRateBasisPoints: String(i.taxRateBasisPoints ?? quote.taxRateBasisPoints),
    })),
  };
}
