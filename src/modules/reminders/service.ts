import type { Prisma, ReminderStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { berlinDayRangeUtc, dateKeyInTimeZone } from "@/lib/timezone";
import { DEAL_STATUS_LABELS } from "@/lib/crm-labels";
import { QUOTE_STATUS_LABELS } from "@/modules/quotes/helpers";
import { buildReminderMail } from "./mail";
import {
  REMINDER_TYPES,
  calendarDaysSince,
  dealReferenceDate,
  dedupeKey,
  evaluateDeal,
  evaluateFollowUp,
  evaluateInvoice,
  evaluateQuote,
  evaluateTask,
  resolveAssignee,
  TARGET_FIELD_BY_TYPE,
  type AssigneeUser,
  type ReminderCandidate,
  type ReminderTypeName,
} from "./rules";
import { ensureReminderSettings } from "./settings";

// Interne Erinnerungen: Regeln auswerten -> Reminder idempotent anlegen ->
// erledigte auflösen -> interne Mails (nur an User.email) senden.
// KEIN Versand an Kontakte, Unternehmen oder Dokument-Empfänger.
export const MAX_MAILS_PER_RUN = 100;
export const MAX_ATTEMPTS = 3;
const MAX_CONSECUTIVE_FAILURES = 3;
const JOB_LOCK_KEY = 620014;

export type ReminderMailer = {
  fromEmail: string;
  send(mail: {
    fromEmail: string;
    fromName: string;
    toEmail: string;
    toName: string;
    subject: string;
    textBody: string;
  }): Promise<unknown>;
};

export type RunSummary = {
  skipped: boolean; // anderer Job läuft bereits
  created: number;
  resolved: number;
  sent: number;
  failed: number;
  noAssignee: number;
  inactiveAssignee: number;
  pendingLeft: number;
};

const assigneeSelect = {
  select: { id: true, email: true, firstName: true, isActive: true },
} as const;

type Assignee = AssigneeUser | null;
const DAY_MS = 86_400_000;

async function loadCandidates(
  settings: Awaited<ReturnType<typeof ensureReminderSettings>>,
  now: Date,
): Promise<ReminderCandidate[]> {
  const candidates: ReminderCandidate[] = [];
  const add = (
    type: ReminderTypeName,
    targetId: string,
    stateKey: string,
    assignee: Assignee,
    data: ReminderCandidate["data"],
  ) =>
    candidates.push({
      type,
      targetField: TARGET_FIELD_BY_TYPE[type],
      targetId,
      dedupeKey: dedupeKey(type, targetId, stateKey),
      assignee,
      data,
    });

  if (settings.quoteEnabled) {
    // Grobe DB-Vorauswahl, exakte Berlin-Tage in evaluateQuote.
    const cutoff = new Date(now.getTime() - (settings.quoteDays - 1) * DAY_MS);
    const quotes = await prisma.quote.findMany({
      where: {
        status: "SENT",
        deletedAt: null,
        OR: [{ sentAt: { lte: cutoff } }, { sentAt: null, updatedAt: { lte: cutoff } }],
      },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        validUntil: true,
        sentAt: true,
        updatedAt: true,
        company: { select: { name: true } },
        assignedUser: assigneeSelect,
      },
    });
    for (const quote of quotes) {
      const result = evaluateQuote(quote, settings.quoteDays, now);
      if (!result.due) continue;
      const reference = quote.sentAt ?? quote.updatedAt;
      add("QUOTE_OPEN", quote.id, result.stateKey, quote.assignedUser, {
        type: "QUOTE_OPEN",
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        companyName: quote.company.name,
        statusLabel: QUOTE_STATUS_LABELS[quote.status],
        sentAt: reference,
        days: calendarDaysSince(reference, now),
      });
    }
  }

  if (settings.dealEnabled) {
    const cutoff = new Date(now.getTime() - (settings.dealDays - 1) * DAY_MS);
    const deals = await prisma.deal.findMany({
      where: { status: "OPEN", deletedAt: null, createdAt: { lte: cutoff } },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        company: { select: { name: true } },
        assignedUser: assigneeSelect,
      },
    });
    // Eine Aggregation für alle Kandidaten statt Query je Deal (kein N+1).
    const lastActivity = deals.length
      ? await prisma.activity.groupBy({
          by: ["dealId"],
          where: { dealId: { in: deals.map((d) => d.id) } },
          _max: { createdAt: true },
        })
      : [];
    const lastByDeal = new Map(lastActivity.map((row) => [row.dealId, row._max.createdAt]));
    for (const deal of deals) {
      const last = lastByDeal.get(deal.id) ?? null;
      const result = evaluateDeal(deal, last, settings.dealDays, now);
      if (!result.due) continue;
      const reference = dealReferenceDate(deal.createdAt, last);
      add("DEAL_INACTIVE", deal.id, result.stateKey, deal.assignedUser, {
        type: "DEAL_INACTIVE",
        id: deal.id,
        name: deal.name,
        companyName: deal.company.name,
        statusLabel: DEAL_STATUS_LABELS[deal.status],
        lastActivityAt: reference,
        days: calendarDaysSince(reference, now),
      });
    }
  }

  if (settings.followUpEnabled) {
    const leads = await prisma.lead.findMany({
      where: {
        status: "OPEN",
        deletedAt: null,
        nextFollowUpAt: { not: null, lte: berlinDayRangeUtc(now).end },
      },
      select: {
        id: true,
        title: true,
        status: true,
        nextFollowUpAt: true,
        deletedAt: true,
        company: { select: { name: true } },
        assignedUser: assigneeSelect,
      },
    });
    for (const lead of leads) {
      const result = evaluateFollowUp(lead, now);
      if (!result.due || !lead.nextFollowUpAt) continue;
      add("FOLLOW_UP_DUE", lead.id, result.stateKey, lead.assignedUser, {
        type: "FOLLOW_UP_DUE",
        id: lead.id,
        title: lead.title,
        companyName: lead.company?.name ?? "–",
        dueAt: lead.nextFollowUpAt,
      });
    }
  }

  if (settings.taskEnabled) {
    const tasks = await prisma.task.findMany({
      where: { status: { not: "COMPLETED" }, deletedAt: null, dueAt: { lt: now } },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        priority: true,
        deletedAt: true,
        assignedUser: assigneeSelect,
      },
    });
    for (const task of tasks) {
      const result = evaluateTask(task, now);
      if (!result.due) continue;
      add("TASK_OVERDUE", task.id, result.stateKey, task.assignedUser, {
        type: "TASK_OVERDUE",
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        priority: task.priority,
      });
    }
  }

  if (settings.invoiceEnabled) {
    const today = new Date(`${dateKeyInTimeZone(now)}T00:00:00Z`);
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["SENT", "OVERDUE"] }, deletedAt: null, dueDate: { lt: today } },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        dueDate: true,
        totalCents: true,
        deletedAt: true,
        company: { select: { name: true } },
        assignedUser: assigneeSelect,
      },
    });
    for (const invoice of invoices) {
      const result = evaluateInvoice(invoice, now);
      if (!result.due) continue;
      add("INVOICE_OVERDUE", invoice.id, result.stateKey, invoice.assignedUser, {
        type: "INVOICE_OVERDUE",
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        companyName: invoice.company.name,
        totalCents: invoice.totalCents,
        dueDate: invoice.dueDate,
      });
    }
  }

  return candidates;
}

function statusFor(candidate: ReminderCandidate): {
  status: ReminderStatus;
  assignedUserId: string | null;
} {
  const resolution = resolveAssignee(candidate.assignee);
  if (resolution.status === "OK") return { status: "PENDING", assignedUserId: resolution.user.id };
  if (resolution.status === "INACTIVE_ASSIGNEE")
    return { status: "INACTIVE_ASSIGNEE", assignedUserId: resolution.userId };
  return { status: "NO_ASSIGNEE", assignedUserId: null };
}

const UNSENT: ReminderStatus[] = ["PENDING", "FAILED", "NO_ASSIGNEE", "INACTIVE_ASSIGNEE"];

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string"
    ? code.replace(/[^A-Z0-9_]/gi, "").slice(0, 60) || "SEND_FAILED"
    : "SEND_FAILED";
}

async function execute(
  mailer: ReminderMailer,
  baseUrl: string,
  now: Date,
  batchLimit: number,
): Promise<Omit<RunSummary, "skipped">> {
  const settings = await ensureReminderSettings();
  const candidates = await loadCandidates(settings, now);
  const byKey = new Map(candidates.map((c) => [c.dedupeKey, c]));
  const summary = {
    created: 0,
    resolved: 0,
    sent: 0,
    failed: 0,
    noAssignee: 0,
    inactiveAssignee: 0,
    pendingLeft: 0,
  };

  // 1) Neue Reminder anlegen. UNIQUE(dedupe_key) + skipDuplicates: auch bei
  // parallelen Läufen entsteht pro Zustand genau eine Zeile.
  const existing = candidates.length
    ? await prisma.reminder.findMany({
        where: { dedupeKey: { in: candidates.map((c) => c.dedupeKey) } },
        select: { id: true, dedupeKey: true, status: true, assignedUserId: true },
      })
    : [];
  const existingByKey = new Map(existing.map((r) => [r.dedupeKey, r]));
  const fresh = candidates.filter((c) => !existingByKey.has(c.dedupeKey));
  if (fresh.length) {
    const created = await prisma.reminder.createMany({
      data: fresh.map((c): Prisma.ReminderCreateManyInput => {
        const { status, assignedUserId } = statusFor(c);
        return {
          type: c.type,
          dedupeKey: c.dedupeKey,
          [c.targetField]: c.targetId,
          status,
          assignedUserId,
          triggeredAt: now,
        };
      }),
      skipDuplicates: true,
    });
    summary.created = created.count;
  }

  // 2) Noch nicht gesendete Reminder an den AKTUELLEN Verantwortlichen binden
  // (Wechsel des Verantwortlichen / Reaktivierung); gesendete bleiben Historie.
  for (const reminder of existing) {
    const candidate = byKey.get(reminder.dedupeKey);
    if (!candidate || !UNSENT.includes(reminder.status)) continue;
    const wanted = statusFor(candidate);
    const nextStatus =
      reminder.status === "FAILED" && wanted.status === "PENDING" ? "FAILED" : wanted.status;
    if (nextStatus !== reminder.status || wanted.assignedUserId !== reminder.assignedUserId) {
      await prisma.reminder.updateMany({
        where: { id: reminder.id, status: { in: UNSENT } },
        data: { status: nextStatus, assignedUserId: wanted.assignedUserId },
      });
    }
  }

  // 3) Nicht mehr relevante offene Reminder (erledigt, gelöscht, Regel aus,
  // Zustand geändert) automatisch auflösen. Schließt den Fachdatensatz nie.
  const open = await prisma.reminder.findMany({
    where: { status: { not: "RESOLVED" } },
    select: { id: true, dedupeKey: true, status: true },
  });
  const staleIds = open
    .filter((r) => r.status !== "SENDING" && !byKey.has(r.dedupeKey))
    .map((r) => r.id);
  if (staleIds.length) {
    const resolved = await prisma.reminder.updateMany({
      where: { id: { in: staleIds }, status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolvedAt: now },
    });
    summary.resolved = resolved.count;
  }

  // 4) Interne Mails senden (Batch-Limit gegen Mail-Flut nach Downtime).
  const sendable = await prisma.reminder.findMany({
    where: {
      OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }],
      assignedUser: { isActive: true },
    },
    orderBy: { triggeredAt: "asc" },
    select: { id: true, dedupeKey: true, assignedUserId: true },
  });
  let consecutiveFailures = 0;
  let attempted = 0;
  for (const reminder of sendable) {
    const candidate = byKey.get(reminder.dedupeKey);
    const assignee = candidate?.assignee;
    // Empfänger ist ausschließlich der aktuell zuständige, aktive Benutzer.
    if (!candidate || !assignee || !assignee.isActive || assignee.id !== reminder.assignedUserId)
      continue;
    if (attempted >= batchLimit || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;

    // Atomarer Claim: nur ein Prozess darf diese Zeile senden.
    const claim = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue;
    attempted += 1;

    const mail = buildReminderMail(candidate.data, assignee, baseUrl, now);
    try {
      await mailer.send({
        fromEmail: mailer.fromEmail,
        fromName: "RDEvolution CRM",
        toEmail: assignee.email,
        toName: assignee.firstName,
        subject: mail.subject,
        textBody: mail.text,
      });
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", emailSentAt: new Date(), lastError: null },
      });
      summary.sent += 1;
      consecutiveFailures = 0;
    } catch (error) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "FAILED", lastError: errorCode(error) },
      });
      summary.failed += 1;
      consecutiveFailures += 1;
    }
  }

  const counts = await prisma.reminder.groupBy({
    by: ["status"],
    where: { status: { in: ["PENDING", "NO_ASSIGNEE", "INACTIVE_ASSIGNEE"] } },
    _count: { _all: true },
  });
  const count = (status: ReminderStatus) =>
    counts.find((row) => row.status === status)?._count._all ?? 0;
  summary.pendingLeft = count("PENDING");
  summary.noAssignee = count("NO_ASSIGNEE");
  summary.inactiveAssignee = count("INACTIVE_ASSIGNEE");
  return summary;
}

export async function runReminders(options: {
  mailer: ReminderMailer;
  baseUrl: string;
  now?: Date;
  batchLimit?: number;
}): Promise<RunSummary> {
  const now = options.now ?? new Date();
  const batchLimit = options.batchLimit ?? MAX_MAILS_PER_RUN;
  // Job-Sperre: läuft bereits ein Job (anderer Prozess/Timer-Überlappung),
  // beendet sich dieser sofort. Transaktionsgebundene Advisory-Lock-Variante,
  // da der Connection-Pool keine Session-Locks garantiert.
  const result = await prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${JOB_LOCK_KEY}) AS locked`;
      if (!rows[0]?.locked) return null;
      return execute(options.mailer, options.baseUrl, now, batchLimit);
    },
    { timeout: 10 * 60_000, maxWait: 10_000 },
  );
  if (!result) {
    return {
      skipped: true,
      created: 0,
      resolved: 0,
      sent: 0,
      failed: 0,
      noAssignee: 0,
      inactiveAssignee: 0,
      pendingLeft: 0,
    };
  }
  return { skipped: false, ...result };
}

export { REMINDER_TYPES };
