import { dateKeyInTimeZone } from "@/lib/timezone";
export const QUOTE_STATUSES = [
  "DRAFT",
  "READY",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Entwurf",
  READY: "Bereit",
  SENT: "Gesendet",
  ACCEPTED: "Angenommen",
  REJECTED: "Abgelehnt",
  EXPIRED: "Abgelaufen",
  CANCELLED: "Storniert",
};
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["DRAFT", "SENT", "CANCELLED"],
  SENT: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: ["CANCELLED"],
  CANCELLED: [],
};
export function effectiveQuoteStatus(
  quote: { status: QuoteStatus; validUntil: Date },
  now = new Date(),
): QuoteStatus {
  return (quote.status === "READY" || quote.status === "SENT") &&
    quote.validUntil.toISOString().slice(0, 10) < dateKeyInTimeZone(now)
    ? "EXPIRED"
    : quote.status;
}
export function canEditQuote(status: QuoteStatus): boolean {
  return status === "DRAFT" || status === "READY";
}
export const canDeleteQuote = (status: QuoteStatus) => status === "DRAFT" || status === "READY";
export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}
export function formatQuoteNumber(year: number, number: number): string {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2200 ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 2_147_483_647
  )
    throw new Error("Ungültige Angebotsnummer.");
  return `ANG-${year}-${String(number).padStart(4, "0")}`;
}
export const DEFAULT_QUOTE_INTRO =
  "Vielen Dank für Ihr Interesse. Gerne unterbreiten wir Ihnen folgendes Angebot.";
export const DEFAULT_QUOTE_CLOSING = "Dieses Angebot ist bis zum angegebenen Datum gültig.";
export function quoteEmailPrefill(quote: {
  quoteNumber: string;
  recipientName: string;
  recipientContact: string | null;
  issuerName: string;
}) {
  return {
    subject: `Angebot ${quote.quoteNumber} – ${quote.issuerName}`,
    textBody: `Guten Tag${quote.recipientContact ? ` ${quote.recipientContact}` : ""},\n\nanbei erhalten Sie unser Angebot ${quote.quoteNumber} für ${quote.recipientName}. Bei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n${quote.issuerName}`,
  };
}
