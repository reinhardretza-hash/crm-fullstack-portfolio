import type { Invoice, InvoiceItem } from "@/generated/prisma/client";
import { issuerSchema, issuerIncomplete } from "./issuer";
export function invoicePdfData(invoice: Invoice & { items: InvoiceItem[] }) {
  const issuer = issuerSchema.parse(invoice.issuerSnapshot);
  return {
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate.toISOString().slice(0, 10),
    issuerName: invoice.issuerName,
    recipientName: invoice.recipientName,
    recipientContact: invoice.recipientContact,
    recipientAddress: invoice.recipientAddress,
    currency: invoice.currency,
    introText: invoice.introText,
    closingText: invoice.closingText,
    customerNote: invoice.customerNote,
    createdAt: invoice.createdAt,
    subtotalCents: invoice.subtotalCents,
    taxCents: invoice.taxCents,
    totalCents: invoice.totalCents,
    development: issuerIncomplete(issuer),
    issuerDetails: [
      issuer.street,
      [issuer.postalCode, issuer.city].filter(Boolean).join(" "),
      issuer.country,
      issuer.vatId ? `USt-IdNr.: ${issuer.vatId}` : "",
      issuer.taxNumber ? `Steuernummer: ${issuer.taxNumber}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    paymentDetails: [
      `Bitte zahlen Sie bis zum ${invoice.dueDate.toISOString().slice(0, 10).split("-").reverse().join(".")} unter Angabe der Rechnungsnummer ${invoice.invoiceNumber}.`,
      issuer.bankName ? `Bank: ${issuer.bankName}` : "",
      issuer.iban ? `IBAN: ${issuer.iban}` : "",
      issuer.bic ? `BIC: ${issuer.bic}` : "",
      !issuer.iban ? "Bankverbindung nicht hinterlegt. Bitte kontaktieren Sie den Aussteller." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    items: invoice.items.map((i) => ({
      position: i.position,
      title: i.title,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPriceCents: i.unitPriceCents,
      taxRateBasisPoints: i.taxRateBasisPoints,
      lineSubtotalCents: i.lineSubtotalCents,
      lineTaxCents: i.lineTaxCents,
      lineTotalCents: i.lineTotalCents,
    })),
  };
}
export type InvoicePdfData = ReturnType<typeof invoicePdfData>;
