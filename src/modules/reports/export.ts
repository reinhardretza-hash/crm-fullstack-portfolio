import { DEAL_STATUS_LABELS } from "@/lib/crm-labels";
import { dateKeyInTimeZone } from "@/lib/timezone";
import type {
  DealStatus,
  InvoiceStatus as PrismaInvoiceStatus,
  QuoteStatus as PrismaQuoteStatus,
} from "@/generated/prisma/client";
import { INVOICE_STATUS_LABELS, effectiveInvoiceStatus } from "@/modules/invoices/helpers";
import { QUOTE_STATUS_LABELS, effectiveQuoteStatus } from "@/modules/quotes/helpers";
import { centsToCsvAmount, toCsv } from "./csv";

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "");
const berlinDay = (date: Date | null) => (date ? dateKeyInTimeZone(date) : "");

type DealRow = {
  name: string;
  status: DealStatus;
  valueCents: number;
  createdAt: Date;
  closedAt: Date | null;
  company: { name: string };
};
type QuoteRow = {
  quoteNumber: string;
  status: PrismaQuoteStatus;
  totalCents: number;
  issueDate: Date;
  validUntil: Date;
  company: { name: string };
};
type InvoiceRow = {
  invoiceNumber: string;
  status: PrismaInvoiceStatus;
  totalCents: number;
  issueDate: Date;
  dueDate: Date;
  paidAt: Date | null;
  company: { name: string };
};

export function buildExportCsv(type: "deals" | "quotes" | "invoices", rows: unknown[]): string {
  if (type === "deals") {
    return toCsv(
      ["Deal", "Unternehmen", "Status", "Wert (EUR)", "Angelegt", "Abgeschlossen"],
      (rows as DealRow[]).map((r) => [
        r.name,
        r.company.name,
        DEAL_STATUS_LABELS[r.status],
        centsToCsvAmount(r.valueCents),
        berlinDay(r.createdAt),
        berlinDay(r.closedAt),
      ]),
    );
  }
  if (type === "quotes") {
    return toCsv(
      [
        "Angebotsnummer",
        "Unternehmen",
        "Status",
        "Gesamtbetrag (EUR)",
        "Angebotsdatum",
        "Gültig bis",
      ],
      (rows as QuoteRow[]).map((r) => [
        r.quoteNumber,
        r.company.name,
        QUOTE_STATUS_LABELS[effectiveQuoteStatus(r)],
        centsToCsvAmount(r.totalCents),
        day(r.issueDate),
        day(r.validUntil),
      ]),
    );
  }
  return toCsv(
    [
      "Rechnungsnummer",
      "Unternehmen",
      "Status",
      "Gesamtbetrag (EUR)",
      "Rechnungsdatum",
      "Fällig am",
      "Bezahlt am",
    ],
    (rows as InvoiceRow[]).map((r) => [
      r.invoiceNumber,
      r.company.name,
      INVOICE_STATUS_LABELS[effectiveInvoiceStatus(r)],
      centsToCsvAmount(r.totalCents),
      day(r.issueDate),
      day(r.dueDate),
      berlinDay(r.paidAt),
    ]),
  );
}
