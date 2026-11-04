import type { ActivityType } from "@/generated/prisma/client";
import { ACTIVITY_CATEGORY_BY_TYPE, type ActivityCategory } from "@/modules/activity/catalog";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/modules/invoices/helpers";
import { QUOTE_STATUSES, type QuoteStatus } from "@/modules/quotes/helpers";

// Reine KPI-Berechnungen (ohne DB). Geld ausschließlich als Integer-Cent.
export type CountSum = { count: number; cents: number };
export const ZERO: CountSum = { count: 0, cents: 0 };

export function addCountSum(a: CountSum, b: CountSum): CountSum {
  return { count: a.count + b.count, cents: a.cents + b.cents };
}

export function sumOf(map: Partial<Record<string, CountSum>>, keys: readonly string[]): CountSum {
  return keys.reduce((acc, key) => addCountSum(acc, map[key] ?? ZERO), ZERO);
}

export function emptyStatusMap<S extends string>(statuses: readonly S[]): Record<S, CountSum> {
  return Object.fromEntries(statuses.map((s) => [s, ZERO])) as Record<S, CountSum>;
}

// Moves the already-expired subset of `from` statuses into `to` (derived
// statuses: Quote READY/SENT -> EXPIRED, Invoice SENT -> OVERDUE). The
// shifts are grouped by their stored status.
function shift<S extends string>(
  map: Record<S, CountSum>,
  to: S,
  shifts: Partial<Record<S, CountSum>>,
): Record<S, CountSum> {
  const result = { ...map };
  for (const [from, moved] of Object.entries(shifts) as [S, CountSum][]) {
    if (!moved) continue;
    result[from] = {
      count: result[from].count - moved.count,
      cents: result[from].cents - moved.cents,
    };
    result[to] = addCountSum(result[to], moved);
  }
  return result;
}

export const applyQuoteExpiry = (
  map: Record<QuoteStatus, CountSum>,
  shifts: Partial<Record<QuoteStatus, CountSum>>,
) => shift<QuoteStatus>(map, "EXPIRED", shifts);

export const applyInvoiceOverdue = (
  map: Record<InvoiceStatus, CountSum>,
  shifts: Partial<Record<InvoiceStatus, CountSum>>,
) => shift<InvoiceStatus>(map, "OVERDUE", shifts);

export function quoteSummary(byStatus: Record<QuoteStatus, CountSum>) {
  const created = QUOTE_STATUSES.reduce((acc, s) => addCountSum(acc, byStatus[s]), ZERO);
  const valueCreated = sumOf(
    byStatus,
    QUOTE_STATUSES.filter((s) => s !== "CANCELLED"),
  );
  const accepted = byStatus.ACCEPTED;
  const rejected = byStatus.REJECTED;
  return {
    created,
    // Gesamtwert erstellt: ohne stornierte Angebote.
    valueCreatedCents: valueCreated.cents,
    acceptedCents: accepted.cents,
    // Offen = versendet und noch gültig (abgelaufene sind EXPIRED).
    openSentCents: byStatus.SENT.cents,
    conversionRate: conversionRate(accepted.count, rejected.count),
  };
}

// Angebots-Conversion: ACCEPTED / (ACCEPTED + REJECTED). Nur entschiedene
// Angebote zählen; offene/abgelaufene/stornierte verzerren die Quote nicht.
// Ohne entschiedene Angebote: null (keine Quote statt 0 %).
export function conversionRate(accepted: number, rejected: number): number | null {
  const decided = accepted + rejected;
  return decided === 0 ? null : Math.round((accepted / decided) * 1000) / 10;
}

export function invoiceSummary(byStatus: Record<InvoiceStatus, CountSum>) {
  // Fakturiert = tatsächlich versendete Rechnungen (SENT/PAID/OVERDUE);
  // Entwürfe, bereite und stornierte Rechnungen zählen nicht als Umsatz.
  const invoiced = sumOf(byStatus, ["SENT", "PAID", "OVERDUE"]);
  return { invoiced, issued: INVOICE_STATUSES.reduce((a, s) => addCountSum(a, byStatus[s]), ZERO) };
}

export function averageCents(total: CountSum): number {
  return total.count === 0 ? 0 : Math.round(total.cents / total.count);
}

// Activity types -> categories (Phase 12 catalog, single source).
export function activitiesByCategory(
  rows: { type: ActivityType; count: number }[],
): { category: ActivityCategory; count: number }[] {
  const totals = new Map<ActivityCategory, number>();
  for (const row of rows) {
    const category = ACTIVITY_CATEGORY_BY_TYPE[row.type];
    totals.set(category, (totals.get(category) ?? 0) + row.count);
  }
  return [...totals]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
