import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import { berlinDayRangeUtc } from "@/lib/timezone";
import type { FollowUpFilters, LeadFilters } from "@/validations/lead";
import { isLeadFollowUpOverdue } from "./stage-status";

function baseWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    pipelineId: filters.pipelineId,
    stageId: filters.stageId,
    status: filters.status,
    priority: filters.priority,
    interest: filters.interest,
    source: filters.source,
    assignedUserId: filters.assignedUserId,
    score:
      filters.scoreMin !== undefined || filters.scoreMax !== undefined
        ? { gte: filters.scoreMin, lte: filters.scoreMax }
        : undefined,
    nextFollowUpAt: filters.overdue ? { lt: new Date() } : undefined,
    OR: filters.q
      ? [
          { title: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}

const LEAD_LIST_INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  stage: { select: { id: true, name: true, isWonStage: true, isLostStage: true } },
  assignedUser: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LeadInclude;

export async function listLeads(filters: LeadFilters, pagination: PaginationParams) {
  const where = baseWhere(filters);
  const { skip, take } = toSkipTake(pagination);

  const [leads, totalCount] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { [filters.sort]: filters.direction },
      skip,
      take,
      include: LEAD_LIST_INCLUDE,
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    leads,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
  };
}

export async function getLeadById(id: string) {
  return prisma.lead.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true, country: true, companySize: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      pipeline: { select: { id: true, name: true } },
      stage: {
        select: { id: true, name: true, isWonStage: true, isLostStage: true, probability: true },
      },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { firstName: true, lastName: true } } },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

// Für das Pipeline Board: alle (nicht gelöschten) Leads einer Pipeline in
// einer Query geladen (keine separate Query pro Karte/Spalte - vermeidet
// N+1). Bewusst NICHT auf status=OPEN eingeschränkt: Gewonnen/Verloren sind
// selbst Pipeline-Stufen und sollen auf dem Board sichtbar bleiben, bis der
// Lead archiviert oder gelöscht wird - die "Anzahl offener Leads"-Kennzahl
// zählt separat nur die tatsächlich offenen.
export async function getPipelineBoard(
  pipelineId: string,
  pagination: PaginationParams = { page: 1, pageSize: 100 },
) {
  const where = { pipelineId, deletedAt: null };
  const [pipeline, leads, totalCount, openSummary] = await Promise.all([
    prisma.pipeline.findUnique({
      where: { id: pipelineId },
      include: { stages: { where: { deletedAt: null }, orderBy: { position: "asc" } } },
    }),
    prisma.lead.findMany({
      where,
      include: LEAD_LIST_INCLUDE,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      ...toSkipTake(pagination),
    }),
    prisma.lead.count({ where }),
    prisma.lead.aggregate({
      where: { ...where, status: "OPEN" },
      _count: { id: true },
      _sum: { expectedValueCents: true },
    }),
  ]);

  return {
    pipeline,
    leads,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
    openCount: openSummary._count.id,
    openValueCents: openSummary._sum.expectedValueCents ?? 0,
  };
}

export async function getDefaultPipeline() {
  return prisma.pipeline.findFirst({
    where: { isDefault: true, isActive: true },
    include: { stages: { where: { deletedAt: null }, orderBy: { position: "asc" } } },
  });
}

export async function listPipelineOptions() {
  return prisma.pipeline.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stages: {
        where: { deletedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, name: true },
      },
    },
  });
}

// Dashboard-Aggregation: echte Werte statt Stub. Pipeline-Wert = Summe
// expectedValueCents aller OFFENEN Leads (noch keine Deal-Werte).
export async function getLeadDashboardSummary() {
  const [activeLeads, pipelineValue] = await Promise.all([
    prisma.lead.count({ where: { deletedAt: null, status: "OPEN" } }),
    prisma.lead.aggregate({
      where: { deletedAt: null, status: "OPEN" },
      _sum: { expectedValueCents: true },
    }),
  ]);

  return {
    activeLeads,
    pipelineValueCents: pipelineValue._sum.expectedValueCents ?? 0,
  };
}

// Für Dropdown-Auswahl (z. B. Deal einem Lead zuordnen).
export async function listLeadOptions() {
  return prisma.lead.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
    take: 500,
  });
}

// Zentrale Follow-up-Übersicht (siehe Vorgabe Punkt 26/27): nur Leads mit
// status=OPEN und gesetztem nextFollowUpAt - Won/Lost tauchen hier NIE auf.
// Sortierung: älteste überfällige zuerst (aufsteigend nach
// nextFollowUpAt), damit das Dringendste oben steht.
function followUpWhere(filters: FollowUpFilters, now: Date): Prisma.LeadWhereInput {
  const { end: todayEnd } = berlinDayRangeUtc(now);

  const dueAtFilter: Prisma.DateTimeFilter | undefined = (() => {
    switch (filters.view) {
      case "overdue":
        return { lt: now };
      case "today":
        return { gte: now, lte: todayEnd };
      case "upcoming":
        return { gt: todayEnd };
      case "all":
      default:
        return undefined;
    }
  })();

  return {
    deletedAt: null,
    status: "OPEN",
    nextFollowUpAt: dueAtFilter ? { not: null, ...dueAtFilter } : { not: null },
  };
}

export async function listFollowUps(
  filters: FollowUpFilters,
  now = new Date(),
  pagination: PaginationParams = { page: 1, pageSize: 100 },
) {
  return prisma.lead.findMany({
    where: followUpWhere(filters, now),
    orderBy: [{ nextFollowUpAt: "asc" }, { id: "asc" }],
    ...toSkipTake(pagination),
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      stage: { select: { id: true, name: true } },
      assignedUser: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function countFollowUps(filters: FollowUpFilters, now = new Date()) {
  return prisma.lead.count({ where: followUpWhere(filters, now) });
}

export { isLeadFollowUpOverdue };
