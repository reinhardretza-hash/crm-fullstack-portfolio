import { notFound } from "next/navigation";
import { getQuote, quoteFormOptions } from "@/modules/quotes/queries";
import { canEditQuote, effectiveQuoteStatus } from "@/modules/quotes/helpers";
import { QuoteForm } from "@/modules/quotes/components/quote-form";
import { scaledIntegerToDecimal } from "@/lib/money";
export const metadata = { title: "Angebot bearbeiten – RDEvolution CRM" };
export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const quote = await getQuote((await params).id);
  if (!quote) notFound();
  if (!canEditQuote(effectiveQuoteStatus(quote)))
    return <p role="alert">Dieses Angebot ist inhaltlich schreibgeschützt.</p>;
  const options = await quoteFormOptions();
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <h2 className="text-lg font-semibold">{quote.quoteNumber} bearbeiten</h2>
      <QuoteForm
        id={quote.id}
        version={quote.version}
        options={options}
        defaults={{
          companyId: quote.companyId,
          contactId: quote.contactId || undefined,
          dealId: quote.dealId || undefined,
          assignedUserId: quote.assignedUserId,
          issueDate: quote.issueDate.toISOString().slice(0, 10),
          validUntil: quote.validUntil.toISOString().slice(0, 10),
          taxRateBasisPoints: String(quote.taxRateBasisPoints),
          introText: quote.introText || "",
          closingText: quote.closingText || "",
          customerNote: quote.customerNote || "",
          internalNote: quote.internalNote || "",
          items: quote.items.map((i) => ({
            id: i.id,
            title: i.title,
            description: i.description || "",
            quantity: scaledIntegerToDecimal(i.quantity, 3),
            unit: i.unit,
            unitPrice: scaledIntegerToDecimal(i.unitPriceCents, 2),
            taxRateBasisPoints: i.taxRateBasisPoints === null ? "" : String(i.taxRateBasisPoints),
          })),
        }}
      />
    </div>
  );
}
