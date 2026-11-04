import type { ActivityType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import type { ActivityFilters } from "@/validations/activity";
import { activityTypesInCategory, activityTypesMatchingText } from "./catalog";

// Filter-Mapping (Kategorie + Typ schneiden sich; Suche über Beziehungs-
// felder und Typ-Labels - bewusst KEIN Durchsuchen der Metadata-JSON).
export function buildActivityWhere(filters: ActivityFilters): Prisma.ActivityWhereInput {
  const and: Prisma.ActivityWhereInput[] = [];

  if (filters.category) {
    and.push({ type: { in: activityTypesInCategory(filters.category) } });
  }
  if (filters.type) and.push({ type: filters.type });
  if (filters.userId) and.push({ userId: filters.userId });
  if (filters.leadId) and.push({ leadId: filters.leadId });
  if (filters.dealId) and.push({ dealId: filters.dealId });

  // Unternehmen/Kontakt: direkter Bezug ODER über Lead/Deal/Angebot/Rechnung
  // (viele Aktivitäten tragen nur die Dokument-/Deal-ID).
  if (filters.companyId) {
    const id = filters.companyId;
    and.push({
      OR: [
        { companyId: id },
        { lead: { companyId: id } },
        { deal: { companyId: id } },
        { quote: { companyId: id } },
        { invoice: { companyId: id } },
      ],
    });
  }
  if (filters.contactId) {
    const id = filters.contactId;
    and.push({
      OR: [
        { contactId: id },
        { lead: { contactId: id } },
        { deal: { contactId: id } },
        { quote: { contactId: id } },
        { invoice: { contactId: id } },
      ],
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    and.push({ createdAt: { gte: filters.dateFrom, lte: filters.dateTo } });
  }

  if (filters.q) {
    const contains = { contains: filters.q, mode: "insensitive" as const };
    const matchingTypes = activityTypesMatchingText(filters.q);
    and.push({
      OR: [
        ...(matchingTypes.length > 0 ? [{ type: { in: matchingTypes as ActivityType[] } }] : []),
        { company: { name: contains } },
        { contact: { firstName: contains } },
        { contact: { lastName: contains } },
        { lead: { title: contains } },
        { deal: { name: contains } },
        { task: { title: contains } },
        { calendarEvent: { title: contains } },
        { quote: { quoteNumber: contains } },
        { invoice: { invoiceNumber: contains } },
        { user: { firstName: contains } },
        { user: { lastName: contains } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

// Nur die Felder, die Darstellung/Link brauchen - ein einziger Query mit
// Joins, keine N+1-Nachladungen. deletedAt wird mitgeladen, damit gelöschte
// Ziele historisch lesbar bleiben (Aktivitäten selbst werden NIE gefiltert).
const ACTIVITY_INCLUDE = {
  user: { select: { firstName: true, lastName: true } },
  company: { select: { id: true, name: true, deletedAt: true } },
  contact: { select: { id: true, firstName: true, lastName: true, deletedAt: true } },
  lead: { select: { id: true, title: true, deletedAt: true } },
  deal: { select: { id: true, name: true, deletedAt: true } },
  task: { select: { id: true, title: true, deletedAt: true } },
  calendarEvent: { select: { id: true, title: true, deletedAt: true } },
  quote: { select: { id: true, quoteNumber: true, deletedAt: true } },
  invoice: { select: { id: true, invoiceNumber: true, deletedAt: true } },
} satisfies Prisma.ActivityInclude;

export async function listActivities(filters: ActivityFilters, pagination: PaginationParams) {
  const where = buildActivityWhere(filters);
  const { skip, take } = toSkipTake(pagination);

  const [activities, totalCount] = await Promise.all([
    prisma.activity.findMany({
      where,
      // id als Tiebreaker: stabile Pagination bei identischem createdAt.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      include: ACTIVITY_INCLUDE,
    }),
    prisma.activity.count({ where }),
  ]);

  return { activities, totalCount, totalPages: getTotalPages(totalCount, pagination.pageSize) };
}

// Auswahllisten (begrenzt, ohne Gelöschte) für die Filterleiste.
export async function getActivityFilterOptions() {
  const [users, companies, contacts, leads, deals] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 500,
    }),
    prisma.contact.findMany({
      where: { deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
      take: 500,
    }),
    prisma.lead.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
      take: 500,
    }),
    prisma.deal.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true },
      take: 500,
    }),
  ]);
  return { users, companies, contacts, leads, deals };
}

// Kompakte, begrenzte Aktivitätenliste für Kundenakten (gleiche Filter-
// Logik und Datenbasis wie /activities, nur ohne Count/Pagination).
export async function listRecentActivities(filters: ActivityFilters, take = 15) {
  return prisma.activity.findMany({
    where: buildActivityWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    include: ACTIVITY_INCLUDE,
  });
}
