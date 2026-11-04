import type { DealStatus, LeadStatus, Priority, TaskStatus } from "@/generated/prisma/client";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { effectiveInvoiceStatus, type InvoiceStatus } from "@/modules/invoices/helpers";
import { effectiveQuoteStatus, type QuoteStatus } from "@/modules/quotes/helpers";

// Reine Regel-Logik (ohne DB/SMTP): einfach, deterministisch, Europe/Berlin.
export const REMINDER_TYPES = [
  "QUOTE_OPEN",
  "DEAL_INACTIVE",
  "FOLLOW_UP_DUE",
  "TASK_OVERDUE",
  "INVOICE_OVERDUE",
] as const;
export type ReminderTypeName = (typeof REMINDER_TYPES)[number];

export const REMINDER_TYPE_LABELS: Record<ReminderTypeName, string> = {
  QUOTE_OPEN: "Angebot offen",
  DEAL_INACTIVE: "Deal ohne Aktivität",
  FOLLOW_UP_DUE: "Follow-up fällig",
  TASK_OVERDUE: "Aufgabe überfällig",
  INVOICE_OVERDUE: "Rechnung überfällig",
};

export type ReminderTargetField = "quoteId" | "dealId" | "leadId" | "taskId" | "invoiceId";
export const TARGET_FIELD_BY_TYPE: Record<ReminderTypeName, ReminderTargetField> = {
  QUOTE_OPEN: "quoteId",
  DEAL_INACTIVE: "dealId",
  FOLLOW_UP_DUE: "leadId",
  TASK_OVERDUE: "taskId",
  INVOICE_OVERDUE: "invoiceId",
};
export const PATH_BY_TYPE: Record<ReminderTypeName, string> = {
  QUOTE_OPEN: "/quotes",
  DEAL_INACTIVE: "/deals",
  FOLLOW_UP_DUE: "/leads",
  TASK_OVERDUE: "/tasks",
  INVOICE_OVERDUE: "/invoices",
};

// Kalendertage nach Berlin-Datum (nicht 24h-Blöcke): über die Sommerzeit-
// Umstellung zählt "7 Tage" weiterhin 7 Berlin-Kalendertage.
export function calendarDaysSince(reference: Date, now: Date): number {
  const from = Date.parse(`${dateKeyInTimeZone(reference)}T12:00:00Z`);
  const to = Date.parse(`${dateKeyInTimeZone(now)}T12:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

// UNIQUE-Schlüssel: Typ + Objekt + Zustand. Ändert sich der Zustand (neue
// Aktivität, neues Fälligkeitsdatum, ...), entsteht ein neuer Schlüssel und
// damit ein neuer Reminder; derselbe Zustand nie zweimal.
export function dedupeKey(type: ReminderTypeName, entityId: string, stateKey: string): string {
  return `${type}:${entityId}:${stateKey}`;
}

// --- Verantwortlicher. Nur das bestehende assignedUser; kein Fallback.
export type AssigneeUser = { id: string; email: string; firstName: string; isActive: boolean };
export type AssigneeResolution =
  | { status: "OK"; user: AssigneeUser }
  | { status: "NO_ASSIGNEE" }
  | { status: "INACTIVE_ASSIGNEE"; userId: string };

export function resolveAssignee(user: AssigneeUser | null | undefined): AssigneeResolution {
  if (!user) return { status: "NO_ASSIGNEE" };
  if (!user.isActive) return { status: "INACTIVE_ASSIGNEE", userId: user.id };
  return { status: "OK", user };
}

type RuleResult = { due: boolean; stateKey: string };

// A) Angebot: SENT (nicht angenommen/abgelehnt/storniert/abgelaufen) seit X Tagen.
export function evaluateQuote(
  quote: { status: QuoteStatus; validUntil: Date; sentAt: Date | null; updatedAt: Date },
  days: number,
  now: Date,
): RuleResult {
  const reference = quote.sentAt ?? quote.updatedAt;
  return {
    due:
      quote.status === "SENT" &&
      effectiveQuoteStatus(quote, now) === "SENT" &&
      calendarDaysSince(reference, now) >= days,
    stateKey: `s${reference.getTime()}`,
  };
}

// B) Deal OPEN ohne Aktivität seit X Tagen; ohne Aktivität zählt createdAt.
export function dealReferenceDate(createdAt: Date, lastActivityAt: Date | null): Date {
  return lastActivityAt && lastActivityAt > createdAt ? lastActivityAt : createdAt;
}
export function evaluateDeal(
  deal: { status: DealStatus; createdAt: Date; deletedAt: Date | null },
  lastActivityAt: Date | null,
  days: number,
  now: Date,
): RuleResult {
  const reference = dealReferenceDate(deal.createdAt, lastActivityAt);
  return {
    due: deal.status === "OPEN" && !deal.deletedAt && calendarDaysSince(reference, now) >= days,
    stateKey: `a${reference.getTime()}`,
  };
}

// C) Follow-up am Fälligkeitstag (Berlin) oder überfällig.
export function evaluateFollowUp(
  lead: { status: LeadStatus; nextFollowUpAt: Date | null; deletedAt: Date | null },
  now: Date,
): RuleResult {
  if (!lead.nextFollowUpAt) return { due: false, stateKey: "none" };
  return {
    due:
      lead.status === "OPEN" &&
      !lead.deletedAt &&
      dateKeyInTimeZone(lead.nextFollowUpAt) <= dateKeyInTimeZone(now),
    stateKey: `f${lead.nextFollowUpAt.getTime()}`,
  };
}

// D) Aufgabe nicht erledigt und Fälligkeit vor jetzt.
export function evaluateTask(
  task: { status: TaskStatus; dueAt: Date; deletedAt: Date | null },
  now: Date,
): RuleResult {
  return {
    due: task.status !== "COMPLETED" && !task.deletedAt && task.dueAt < now,
    stateKey: `d${task.dueAt.getTime()}`,
  };
}

// E) Rechnung effektiv überfällig (bestehende Statuslogik).
export function evaluateInvoice(
  invoice: { status: InvoiceStatus; dueDate: Date; deletedAt: Date | null },
  now: Date,
): RuleResult {
  return {
    due: !invoice.deletedAt && effectiveInvoiceStatus(invoice, now) === "OVERDUE",
    stateKey: `d${invoice.dueDate.toISOString().slice(0, 10)}`,
  };
}

// --- Daten für Mail/Dashboard (nur Felder, die gebraucht werden).
export type ReminderMailData =
  | {
      type: "QUOTE_OPEN";
      id: string;
      quoteNumber: string;
      companyName: string;
      statusLabel: string;
      sentAt: Date;
      days: number;
    }
  | {
      type: "DEAL_INACTIVE";
      id: string;
      name: string;
      companyName: string;
      statusLabel: string;
      lastActivityAt: Date;
      days: number;
    }
  | { type: "FOLLOW_UP_DUE"; id: string; title: string; companyName: string; dueAt: Date }
  | {
      type: "TASK_OVERDUE";
      id: string;
      title: string;
      dueAt: Date;
      priority: Priority;
    }
  | {
      type: "INVOICE_OVERDUE";
      id: string;
      invoiceNumber: string;
      companyName: string;
      totalCents: number;
      dueDate: Date;
    };

export type ReminderCandidate = {
  type: ReminderTypeName;
  targetField: ReminderTargetField;
  targetId: string;
  dedupeKey: string;
  assignee: AssigneeUser | null;
  data: ReminderMailData;
};
