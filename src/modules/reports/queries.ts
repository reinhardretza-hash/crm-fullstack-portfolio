import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { berlinDayRangeUtc, dateKeyInTimeZone } from "@/lib/timezone";
import { DEAL_STATUS_LABELS, LEAD_STATUS_LABELS } from "@/lib/crm-labels";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/modules/invoices/helpers";
import { QUOTE_STATUSES, type QuoteStatus } from "@/modules/quotes/helpers";
import {
  activitiesByCategory,
  applyInvoiceOverdue,
  applyQuoteExpiry,
  averageCents,
  emptyStatusMap,
  invoiceSummary,
  quoteSummary,
  ZERO,
  type CountSum,
} from "./kpi";
import { fillBuckets, type ReportPeriod } from "./period";
import type { ReportFilters } from "@/validations/report";

export const DETAIL_LIMIT = 10;

// Alle Aggregationen laufen in der Datenbank (groupBy/aggregate bzw. ein
// parametrisierter date_trunc-Query für Zeitreihen) - keine Rohdaten im JS.
// Soft-deleted operative Datensätze (deletedAt != null) zählen nirgends mit.
// Aktivitäten selbst haben kein deletedAt: die Historie bleibt vollständig.

const dateOnly = (key: string) => new Date(`${key}T00:00:00Z`);

type StatusAggRow<S extends string> = {
  status: S;
  _count: { _all: number };
  _sum: { totalCents: number | null };
};

async function leadSection(period: ReportPeriod, filters: ReportFilters, now: Date) {
  const base: Prisma.LeadWhereInput = { deletedAt: null, assignedUserId: filters.userId };
  const todayRange = berlinDayRangeUtc(now);

  const pipelines = await prisma.pipeline.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      stages: { orderBy: { position: "asc" }, select: { id: true, name: true } },
    },
  });
  const pipeline = pipelines.find((p) => p.id === filters.pipelineId) ?? pipelines[0] ?? null;

  const [newLeads, statusRows, stageRows, followUpOverdue, followUpToday] = await Promise.all([
    prisma.lead.count({ where: { ...base, createdAt: { gte: period.start, lte: period.end } } }),
    prisma.lead.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    pipeline
      ? prisma.lead.groupBy({
          by: ["stageId"],
          where: { ...base, status: "OPEN", pipelineId: pipeline.id },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.lead.count({
      where: { ...base, status: "OPEN", nextFollowUpAt: { lt: todayRange.start } },
    }),
    prisma.lead.count({
      where: {
        ...base,
        status: "OPEN",
        nextFollowUpAt: { gte: todayRange.start, lte: todayRange.end },
      },
    }),
  ]);

  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r._count._all]));
  const stageCounts = new Map(stageRows.map((r) => [r.stageId, r._count._all]));
  return {
    newLeads,
    openLeads: byStatus.OPEN ?? 0,
    statusDistribution: (["OPEN", "WON", "LOST", "ARCHIVED"] as const).map((status) => ({
      key: status,
      label: LEAD_STATUS_LABELS[status],
      value: byStatus[status] ?? 0,
    })),
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name })),
    pipelineName: pipeline?.name ?? null,
    funnel: (pipeline?.stages ?? []).map((stage) => ({
      key: stage.id,
      label: stage.name,
      value: stageCounts.get(stage.id) ?? 0,
    })),
    followUps: { overdue: followUpOverdue, today: followUpToday },
  };
}

type DealAgg = { _count: { _all: number }; _sum: { valueCents: number | null } };
const dealCs = (a: DealAgg): CountSum => ({ count: a._count._all, cents: a._sum.valueCents ?? 0 });

async function dealSection(period: ReportPeriod, filters: ReportFilters) {
  const base: Prisma.DealWhereInput = { deletedAt: null, assignedUserId: filters.userId };
  const inPeriod = { gte: period.start, lte: period.end };
  const agg = { _count: { _all: true }, _sum: { valueCents: true } } as const;
  const [created, open, won, lost, wonList] = await Promise.all([
    prisma.deal.groupBy({ by: ["status"], where: { ...base, createdAt: inPeriod }, ...agg }),
    prisma.deal.aggregate({ where: { ...base, status: "OPEN" }, ...agg }),
    prisma.deal.aggregate({ where: { ...base, status: "WON", closedAt: inPeriod }, ...agg }),
    prisma.deal.aggregate({ where: { ...base, status: "LOST", closedAt: inPeriod }, ...agg }),
    prisma.deal.findMany({
      where: { ...base, status: "WON", closedAt: inPeriod },
      orderBy: { closedAt: "desc" },
      take: DETAIL_LIMIT,
      select: {
        id: true,
        name: true,
        valueCents: true,
        closedAt: true,
        company: { select: { name: true } },
      },
    }),
  ]);
  const createdTotal = created.reduce<CountSum>(
    (acc, r) => ({ count: acc.count + r._count._all, cents: acc.cents + (r._sum.valueCents ?? 0) }),
    ZERO,
  );
  return {
    newDeals: createdTotal.count,
    open: dealCs(open),
    won: dealCs(won),
    lost: dealCs(lost),
    // Durchschnitt über alle im Zeitraum angelegten Deals.
    averageCents: averageCents(createdTotal),
    distribution: (["OPEN", "WON", "LOST"] as const).map((status) => {
      const row = created.find((r) => r.status === status);
      return { key: status, label: DEAL_STATUS_LABELS[status], value: row?._count._all ?? 0 };
    }),
    wonList,
  };
}

function statusMap<S extends string>(statuses: readonly S[], rows: StatusAggRow<S>[]) {
  const map = emptyStatusMap(statuses);
  for (const row of rows) {
    map[row.status] = { count: row._count._all, cents: row._sum.totalCents ?? 0 };
  }
  return map;
}

function shiftMap<S extends string>(rows: StatusAggRow<S>[]) {
  return Object.fromEntries(
    rows.map((r) => [r.status, { count: r._count._all, cents: r._sum.totalCents ?? 0 }]),
  ) as Partial<Record<S, CountSum>>;
}

type TotalAgg = { _count: { _all: number }; _sum: { totalCents: number | null } };
const totalCs = (a: TotalAgg): CountSum => ({
  count: a._count._all,
  cents: a._sum.totalCents ?? 0,
});

async function quoteSection(period: ReportPeriod, filters: ReportFilters, now: Date) {
  const today = dateOnly(dateKeyInTimeZone(now));
  const base: Prisma.QuoteWhereInput = {
    deletedAt: null,
    assignedUserId: filters.userId,
    issueDate: { gte: dateOnly(period.fromKey), lte: dateOnly(period.toKey) },
  };
  const agg = { _count: { _all: true }, _sum: { totalCents: true } } as const;
  const [rows, expiredRows, openList] = await Promise.all([
    prisma.quote.groupBy({ by: ["status"], where: base, ...agg }),
    // Abgeleitet wie effectiveQuoteStatus: READY/SENT + validUntil < heute.
    prisma.quote.groupBy({
      by: ["status"],
      where: { ...base, status: { in: ["READY", "SENT"] }, validUntil: { lt: today } },
      ...agg,
    }),
    prisma.quote.findMany({
      where: {
        deletedAt: null,
        assignedUserId: filters.userId,
        status: { in: ["READY", "SENT"] },
        validUntil: { gte: today },
      },
      orderBy: { validUntil: "asc" },
      take: DETAIL_LIMIT,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        totalCents: true,
        validUntil: true,
        company: { select: { name: true } },
      },
    }),
  ]);
  const byStatus = applyQuoteExpiry(
    statusMap<QuoteStatus>(QUOTE_STATUSES, rows),
    shiftMap<QuoteStatus>(expiredRows),
  );
  return { byStatus, summary: quoteSummary(byStatus), openList };
}

async function invoiceSection(period: ReportPeriod, filters: ReportFilters, now: Date) {
  const today = dateOnly(dateKeyInTimeZone(now));
  const user = { deletedAt: null, assignedUserId: filters.userId } as const;
  const issuedBase: Prisma.InvoiceWhereInput = {
    ...user,
    issueDate: { gte: dateOnly(period.fromKey), lte: dateOnly(period.toKey) },
  };
  // Überfällig wie effectiveInvoiceStatus: OVERDUE oder SENT mit dueDate < heute.
  const overdueWhere: Prisma.InvoiceWhereInput = {
    ...user,
    OR: [{ status: "OVERDUE" }, { status: "SENT", dueDate: { lt: today } }],
  };
  const agg = { _count: { _all: true }, _sum: { totalCents: true } } as const;
  const [rows, overdueShift, paid, open, overdue, overdueList] = await Promise.all([
    prisma.invoice.groupBy({ by: ["status"], where: issuedBase, ...agg }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: { ...issuedBase, status: "SENT", dueDate: { lt: today } },
      ...agg,
    }),
    prisma.invoice.aggregate({
      where: { ...user, status: "PAID", paidAt: { gte: period.start, lte: period.end } },
      ...agg,
    }),
    prisma.invoice.aggregate({ where: { ...user, status: { in: ["SENT", "OVERDUE"] } }, ...agg }),
    prisma.invoice.aggregate({ where: overdueWhere, ...agg }),
    prisma.invoice.findMany({
      where: overdueWhere,
      orderBy: { dueDate: "asc" },
      take: DETAIL_LIMIT,
      select: {
        id: true,
        invoiceNumber: true,
        totalCents: true,
        dueDate: true,
        company: { select: { name: true } },
      },
    }),
  ]);
  const byStatus = applyInvoiceOverdue(
    statusMap<InvoiceStatus>(INVOICE_STATUSES, rows),
    shiftMap<InvoiceStatus>(overdueShift),
  );
  return {
    byStatus,
    summary: invoiceSummary(byStatus),
    paid: totalCs(paid),
    open: totalCs(open),
    overdue: totalCs(overdue),
    overdueList,
  };
}

async function taskSection(period: ReportPeriod, filters: ReportFilters, now: Date) {
  const base: Prisma.TaskWhereInput = { deletedAt: null, assignedUserId: filters.userId };
  const openWhere: Prisma.TaskWhereInput = { ...base, status: { not: "COMPLETED" } };
  const [open, overdue, completed, overdueList] = await Promise.all([
    prisma.task.count({ where: openWhere }),
    prisma.task.count({ where: { ...openWhere, dueAt: { lt: now } } }),
    prisma.task.count({
      where: { ...base, status: "COMPLETED", completedAt: { gte: period.start, lte: period.end } },
    }),
    prisma.task.findMany({
      where: { ...openWhere, dueAt: { lt: now } },
      orderBy: { dueAt: "asc" },
      take: DETAIL_LIMIT,
      select: {
        id: true,
        title: true,
        dueAt: true,
        assignedUser: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);
  return { open, overdue, completed, overdueList };
}

type Bucket = { bucket: string; value: bigint | number };
const toRows = (rows: Bucket[]) => rows.map((r) => ({ bucket: r.bucket, value: Number(r.value) }));
// Spaltenname ist eine feste Konstante (nie Benutzereingabe); die ID ist gebunden.
const userClause = (userId: string | undefined, column: "assigned_user_id" | "user_id") =>
  userId ? Prisma.sql`AND ${Prisma.raw(column)} = ${userId}` : Prisma.empty;

// Zeitreihen: je Reihe ein parametrisierter Query; die date_trunc-Einheit
// kommt aus der Whitelist day|week|month, alle Werte sind gebunden.
async function trendSection(period: ReportPeriod, filters: ReportFilters) {
  const unit = period.granularity;
  const [invoiced, paid, activities] = await Promise.all([
    prisma.$queryRaw<Bucket[]>`
      SELECT to_char(date_trunc(${unit}, issue_date::timestamp), 'YYYY-MM-DD') AS bucket,
             COALESCE(SUM(total_cents), 0)::bigint AS value
      FROM invoices
      WHERE deleted_at IS NULL AND status IN ('SENT', 'PAID', 'OVERDUE')
        AND issue_date BETWEEN ${period.fromKey}::date AND ${period.toKey}::date
        ${userClause(filters.userId, "assigned_user_id")}
      GROUP BY 1`,
    prisma.$queryRaw<Bucket[]>`
      SELECT to_char(date_trunc(${unit}, (paid_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin'), 'YYYY-MM-DD') AS bucket,
             COALESCE(SUM(total_cents), 0)::bigint AS value
      FROM invoices
      WHERE deleted_at IS NULL AND status = 'PAID'
        AND paid_at >= ${period.start} AND paid_at <= ${period.end}
        ${userClause(filters.userId, "assigned_user_id")}
      GROUP BY 1`,
    prisma.$queryRaw<Bucket[]>`
      SELECT to_char(date_trunc(${unit}, (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Berlin'), 'YYYY-MM-DD') AS bucket,
             COUNT(*)::bigint AS value
      FROM activities
      WHERE created_at >= ${period.start} AND created_at <= ${period.end}
        ${userClause(filters.userId, "user_id")}
      GROUP BY 1`,
  ]);
  return {
    invoiced: fillBuckets(period, toRows(invoiced)),
    paid: fillBuckets(period, toRows(paid)),
    activities: fillBuckets(period, toRows(activities)),
  };
}

async function activitySection(period: ReportPeriod, filters: ReportFilters) {
  const where: Prisma.ActivityWhereInput = {
    createdAt: { gte: period.start, lte: period.end },
    userId: filters.userId,
  };
  const [typeRows, userRows] = await Promise.all([
    prisma.activity.groupBy({ by: ["type"], where, _count: { _all: true } }),
    prisma.activity.groupBy({ by: ["userId"], where, _count: { _all: true } }),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: userRows.map((r) => r.userId).filter((id): id is string => !!id) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return {
    total: typeRows.reduce((sum, r) => sum + r._count._all, 0),
    byCategory: activitiesByCategory(typeRows.map((r) => ({ type: r.type, count: r._count._all }))),
    byUser: userRows
      .map((r) => ({
        key: r.userId ?? "none",
        label: r.userId ? (names.get(r.userId) ?? "Unbekannt") : "System",
        value: r._count._all,
      }))
      .sort((a, b) => b.value - a.value),
  };
}

export async function getReport(period: ReportPeriod, filters: ReportFilters, now = new Date()) {
  const [leads, deals, quotes, invoices, tasks, trend, activities] = await Promise.all([
    leadSection(period, filters, now),
    dealSection(period, filters),
    quoteSection(period, filters, now),
    invoiceSection(period, filters, now),
    taskSection(period, filters, now),
    trendSection(period, filters),
    activitySection(period, filters),
  ]);
  return { leads, deals, quotes, invoices, tasks, trend, activities };
}

export type ReportData = Awaited<ReturnType<typeof getReport>>;

// --- CSV-Export (Zeitraum nach Anlage-/Belegdatum, max. 10.000 Zeilen).
export const EXPORT_TYPES = ["deals", "quotes", "invoices"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
const EXPORT_LIMIT = 10_000;

export async function listExportRows(
  type: ExportType,
  period: ReportPeriod,
  filters: ReportFilters,
) {
  const range = { gte: dateOnly(period.fromKey), lte: dateOnly(period.toKey) };
  if (type === "deals") {
    return prisma.deal.findMany({
      where: {
        deletedAt: null,
        assignedUserId: filters.userId,
        createdAt: { gte: period.start, lte: period.end },
      },
      orderBy: { createdAt: "desc" },
      take: EXPORT_LIMIT,
      select: {
        name: true,
        status: true,
        valueCents: true,
        createdAt: true,
        closedAt: true,
        company: { select: { name: true } },
      },
    });
  }
  if (type === "quotes") {
    return prisma.quote.findMany({
      where: { deletedAt: null, assignedUserId: filters.userId, issueDate: range },
      orderBy: { issueDate: "desc" },
      take: EXPORT_LIMIT,
      select: {
        quoteNumber: true,
        status: true,
        totalCents: true,
        issueDate: true,
        validUntil: true,
        company: { select: { name: true } },
      },
    });
  }
  return prisma.invoice.findMany({
    where: { deletedAt: null, assignedUserId: filters.userId, issueDate: range },
    orderBy: { issueDate: "desc" },
    take: EXPORT_LIMIT,
    select: {
      invoiceNumber: true,
      status: true,
      totalCents: true,
      issueDate: true,
      dueDate: true,
      paidAt: true,
      company: { select: { name: true } },
    },
  });
}
