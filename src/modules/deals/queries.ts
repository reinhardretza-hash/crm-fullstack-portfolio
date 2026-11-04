import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import type { DealFilters } from "@/validations/deal";

function baseWhere(filters: DealFilters): Prisma.DealWhereInput {
  return {
    deletedAt: null,
    status: filters.status,
    service: filters.service,
    assignedUserId: filters.assignedUserId,
    companyId: filters.companyId,
    expectedCloseDate:
      filters.closeDateFrom !== undefined || filters.closeDateTo !== undefined
        ? { gte: filters.closeDateFrom, lte: filters.closeDateTo }
        : undefined,
    valueCents:
      filters.valueMinCents !== undefined || filters.valueMaxCents !== undefined
        ? { gte: filters.valueMinCents, lte: filters.valueMaxCents }
        : undefined,
    OR: filters.q
      ? [
          { name: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}

const DEAL_LIST_INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  assignedUser: { select: { firstName: true, lastName: true } },
} satisfies Prisma.DealInclude;

export async function listDeals(filters: DealFilters, pagination: PaginationParams) {
  const where = baseWhere(filters);
  const { skip, take } = toSkipTake(pagination);

  const [deals, totalCount] = await Promise.all([
    prisma.deal.findMany({
      where,
      orderBy: { [filters.sort]: filters.direction },
      skip,
      take,
      include: DEAL_LIST_INCLUDE,
    }),
    prisma.deal.count({ where }),
  ]);

  return {
    deals,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
  };
}

export async function getDealById(id: string) {
  return prisma.deal.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      lead: { select: { id: true, title: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      // Notizen/Aktivitäten werden auf der Kundenakte begrenzt und gezielt geladen
      // (src/modules/customer-file), nicht unbegrenzt hier.
    },
  });
}

// Für Deal-Sektionen auf Lead-/Company-/Contact-Detailseiten - bewusst
// schlank (keine Notes/Activities), da dort nur eine kompakte Übersicht
// gefordert ist (siehe Vorgabe Punkt 24-26).
const DEAL_COMPACT_SELECT = {
  id: true,
  name: true,
  status: true,
  valueCents: true,
  expectedCloseDate: true,
} satisfies Prisma.DealSelect;

export async function listDealsForLead(leadId: string) {
  return prisma.deal.findMany({
    where: { leadId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: DEAL_COMPACT_SELECT,
  });
}

export async function listDealsForCompany(companyId: string) {
  return prisma.deal.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: DEAL_COMPACT_SELECT,
  });
}

export async function listDealsForContact(contactId: string) {
  return prisma.deal.findMany({
    where: { contactId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: DEAL_COMPACT_SELECT,
  });
}

// Dashboard-Aggregation: echte Werte statt Stub. Deal-Wert ist eine eigene
// Kennzahl, getrennt von der Lead-Pipeline-Wert-Kennzahl (siehe Vorgabe
// Punkt 22) - beide dürfen nicht vermischt werden.
export async function getDealDashboardSummary() {
  const [openDeals, openValue, wonDeals, lostDeals] = await Promise.all([
    prisma.deal.count({ where: { deletedAt: null, status: "OPEN" } }),
    prisma.deal.aggregate({
      where: { deletedAt: null, status: "OPEN" },
      _sum: { valueCents: true },
    }),
    prisma.deal.count({ where: { deletedAt: null, status: "WON" } }),
    prisma.deal.count({ where: { deletedAt: null, status: "LOST" } }),
  ]);

  return {
    openDeals,
    openDealsValueCents: openValue._sum.valueCents ?? 0,
    wonDeals,
    lostDeals,
  };
}

// Für Dropdown-Auswahl (z. B. Aufgabe einem Deal zuordnen).
export async function listDealOptions() {
  return prisma.deal.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
    take: 500,
  });
}
