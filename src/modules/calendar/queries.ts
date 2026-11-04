import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import type { Prisma } from "@/generated/prisma/client";
import type { CalendarFilters } from "@/validations/calendar";
import type { EmailContext } from "@/validations/email";
import { strictBerlinTimeToUtc, addCalendarDays } from "@/lib/timezone";
import { toSkipTake, getTotalPages, type PaginationParams } from "@/lib/pagination";
export const EVENT_INCLUDE = {
  assignedUser: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  lead: { select: { id: true, title: true } },
  deal: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
} satisfies Prisma.CalendarEventInclude;
export function calendarWhere(
  filters: CalendarFilters,
  userId: string,
  interval?: { startsAt: Date; endsAt: Date },
): Prisma.CalendarEventWhereInput {
  const range = {
    startsAt: filters.dateFrom ? strictBerlinTimeToUtc(filters.dateFrom, "00:00") : undefined,
    endsAt: filters.dateTo
      ? strictBerlinTimeToUtc(addCalendarDays(filters.dateTo, 1), "00:00")
      : undefined,
  };
  return {
    deletedAt: null,
    status: filters.status,
    assignedUserId: filters.scope === "mine" ? userId : filters.userId,
    startsAt: range.endsAt ? { lt: range.endsAt } : undefined,
    endsAt: range.startsAt ? { gt: range.startsAt } : undefined,
    AND: interval
      ? [{ startsAt: { lt: interval.endsAt }, endsAt: { gt: interval.startsAt } }]
      : undefined,
    ...(filters.crmType === "none"
      ? { companyId: null, contactId: null, leadId: null, dealId: null }
      : filters.crmType
        ? { [`${filters.crmType}Id`]: { not: null } }
        : {}),
    OR: filters.q
      ? [
          { title: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
          { lead: { title: { contains: filters.q, mode: "insensitive" } } },
          { deal: { name: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}
export async function listCalendarEvents(
  filters: CalendarFilters,
  pagination: PaginationParams,
  interval?: { startsAt: Date; endsAt: Date },
) {
  const user = await requireUser(),
    where = calendarWhere(filters, user.id, interval);
  const limits: { take: number; skip?: number } = interval ? { take: 500 } : toSkipTake(pagination);
  const [events, totalCount] = await Promise.all([
    prisma.calendarEvent.findMany({
      where,
      include: EVENT_INCLUDE,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      ...limits,
    }),
    prisma.calendarEvent.count({ where }),
  ]);
  return { events, totalCount, totalPages: getTotalPages(totalCount, pagination.pageSize) };
}
export async function getCalendarEvent(id: string) {
  await requireUser();
  return prisma.calendarEvent.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...EVENT_INCLUDE,
      activities: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}
export async function findCalendarOverlaps(event: {
  assignedUserId: string;
  startsAt: Date;
  endsAt: Date;
  id?: string;
}) {
  await requireUser();
  return prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      status: "SCHEDULED",
      assignedUserId: event.assignedUserId,
      id: event.id ? { not: event.id } : undefined,
      startsAt: { lt: event.endsAt },
      endsAt: { gt: event.startsAt },
    },
    select: { id: true, title: true },
    take: 5,
  });
}
export async function upcomingCalendarEvents(
  context: EmailContext = {},
  now = new Date(),
  assignedUserId?: string,
) {
  await requireUser();
  return prisma.calendarEvent.findMany({
    where: {
      ...context,
      deletedAt: null,
      status: "SCHEDULED",
      startsAt: { gte: now },
      assignedUserId,
    },
    include: EVENT_INCLUDE,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 5,
  });
}
export async function calendarFormOptions() {
  await requireUser();
  const [users, companies, contacts, leads, deals, tasks] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contact.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    prisma.deal.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);
  return { users, companies, contacts, leads, deals, tasks };
}
