import { notFound } from "next/navigation";
import { getInvoice, invoiceFormOptions } from "@/modules/invoices/queries";
import { canEditInvoice, effectiveInvoiceStatus } from "@/modules/invoices/helpers";
import { InvoiceForm } from "@/modules/invoices/components/invoice-form";
import { scaledIntegerToDecimal } from "@/lib/money";
export const metadata = { title: "Rechnung bearbeiten – RDEvolution CRM" };
export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const invoice = await getInvoice((await params).id);
  if (!invoice) notFound();
  if (!canEditInvoice(effectiveInvoiceStatus(invoice)))
    return <p role="alert">Diese Rechnung ist inhaltlich schreibgeschützt.</p>;
  const options = await invoiceFormOptions();
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <h2 className="text-lg font-semibold">{invoice.invoiceNumber} bearbeiten</h2>
      <InvoiceForm
        quoteId={invoice.quoteId || undefined}
        id={invoice.id}
        version={invoice.version}
        options={options}
        defaults={{
          companyId: invoice.companyId,
          contactId: invoice.contactId || undefined,
          dealId: invoice.dealId || undefined,
          assignedUserId: invoice.assignedUserId,
          issueDate: invoice.issueDate.toISOString().slice(0, 10),
          dueDate: invoice.dueDate.toISOString().slice(0, 10),
          taxRateBasisPoints: String(invoice.taxRateBasisPoints),
          introText: invoice.introText || "",
          closingText: invoice.closingText || "",
          customerNote: invoice.customerNote || "",
          internalNote: invoice.internalNote || "",
          items: invoice.items.map((i) => ({
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
