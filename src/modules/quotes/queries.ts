import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { toSkipTake, getTotalPages, type PaginationParams } from "@/lib/pagination";
import type { QuoteFilters } from "@/validations/quote";
export const QUOTE_INCLUDE = {
  company: true,
  contact: true,
  deal: true,
  assignedUser: { select: { id: true, firstName: true, lastName: true } },
  items: { orderBy: { position: "asc" as const } },
} satisfies Prisma.QuoteInclude;
export function quoteWhere(filters: QuoteFilters, now = new Date()): Prisma.QuoteWhereInput {
  const today = new Date(dateKeyInTimeZone(now));
  const status: Prisma.QuoteWhereInput =
    filters.status === "EXPIRED"
      ? {
          OR: [
            { status: "EXPIRED" },
            { status: { in: ["READY", "SENT"] }, validUntil: { lt: today } },
          ],
        }
      : filters.status === "READY" || filters.status === "SENT"
        ? { status: filters.status, validUntil: { gte: today } }
        : { status: filters.status };
  return {
    deletedAt: null,
    companyId: filters.companyId,
    assignedUserId: filters.userId,
    AND: [
      status,
      ...(filters.validity
        ? [{ validUntil: filters.validity === "expired" ? { lt: today } : { gte: today } }]
        : []),
    ],
    issueDate: {
      gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
    },
    OR: filters.q
      ? [
          { quoteNumber: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
          { deal: { name: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}
export async function listQuotes(filters: QuoteFilters, pagination: PaginationParams) {
  await requireUser();
  const where = quoteWhere(filters);
  const sort = {
    updated: "updatedAt",
    number: "quoteNumber",
    total: "totalCents",
    validUntil: "validUntil",
  }[filters.sort];
  const [quotes, totalCount] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: QUOTE_INCLUDE,
      orderBy: [{ [sort]: filters.direction }, { id: "asc" }],
      ...toSkipTake(pagination),
    }),
    prisma.quote.count({ where }),
  ]);
  return { quotes, totalCount, totalPages: getTotalPages(totalCount, pagination.pageSize) };
}
export async function getQuote(id: string) {
  await requireUser();
  return prisma.quote.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...QUOTE_INCLUDE,
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      emails: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}
export async function quoteFormOptions(filtersOnly = false) {
  await requireUser();
  const [companies, contacts, deals, users] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    filtersOnly
      ? Promise.resolve([])
      : prisma.contact.findMany({
          where: { deletedAt: null },
          select: { id: true, firstName: true, lastName: true, companyId: true },
          orderBy: { lastName: "asc" },
        }),
    filtersOnly
      ? Promise.resolve([])
      : prisma.deal.findMany({
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            companyId: true,
            contactId: true,
            assignedUserId: true,
            valueCents: true,
          },
          orderBy: { name: "asc" },
        }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  return { companies, contacts, deals, users };
}
