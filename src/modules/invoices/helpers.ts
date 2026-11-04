import { dateKeyInTimeZone } from "@/lib/timezone";
export const INVOICE_STATUSES = ["DRAFT", "READY", "SENT", "PAID", "OVERDUE", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Entwurf",
  READY: "Bereit",
  SENT: "Gesendet",
  PAID: "Bezahlt",
  OVERDUE: "Überfällig",
  CANCELLED: "Storniert",
};
export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["DRAFT", "SENT", "CANCELLED"],
  SENT: ["PAID", "CANCELLED"],
  OVERDUE: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
};
export const canEditInvoice = (status: InvoiceStatus) => status === "DRAFT" || status === "READY";
export const canDeleteInvoice = (status: InvoiceStatus) => status === "DRAFT" || status === "READY";
export const canTransitionInvoice = (from: InvoiceStatus, to: InvoiceStatus) =>
  INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
export function effectiveInvoiceStatus(
  invoice: { status: InvoiceStatus; dueDate: Date },
  now = new Date(),
): InvoiceStatus {
  return invoice.status === "SENT" &&
    invoice.dueDate.toISOString().slice(0, 10) < dateKeyInTimeZone(now)
    ? "OVERDUE"
    : invoice.status;
}
export function formatInvoiceNumber(year: number, number: number) {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 2147483647
  )
    throw new Error("Ungültige Rechnungsnummer.");
  return `RE-${year}-${String(number).padStart(4, "0")}`;
}
export function invoiceEmailPrefill(invoice: {
  invoiceNumber: string;
  recipientContact: string | null;
  issuerName: string;
}) {
  return {
    subject: `Rechnung ${invoice.invoiceNumber} – ${invoice.issuerName}`,
    textBody: `Guten Tag${invoice.recipientContact ? " " + invoice.recipientContact : ""},\n\nanbei erhalten Sie unsere Rechnung ${invoice.invoiceNumber}. Bitte beachten Sie das angegebene Zahlungsziel.\n\nMit freundlichen Grüßen\n${invoice.issuerName}`,
  };
}
export const duplicateInvoiceWarning = (count: number) =>
  count > 0
    ? "Zu diesem Angebot existiert bereits eine aktive Rechnung. Bitte prüfen und die weitere Vollrechnung ausdrücklich bestätigen."
    : null;
