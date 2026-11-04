import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import { berlinDayRangeUtc } from "@/lib/timezone";
import { UPCOMING_WINDOW_DAYS } from "./due";
import type { TaskFilters, TaskView } from "@/validations/task";

// Zentrale Übersetzung der schnellen Ansichten (siehe Vorgabe Punkt 14) in
// einen Prisma-Filter. Die Grenzen entsprechen exakt der Klassifikation in
// src/modules/tasks/due.ts (isTaskOverdue/isTaskDueToday/isTaskUpcoming) -
// dieselbe Definition, nur einmal als Objektvergleich (pure Funktion, für
// Einzelobjekte) und einmal als DB-WHERE (für Listen), bewusst nicht
// dupliziert in der eigentlichen Regel, nur in der jeweils nötigen Form.
function viewWhere(view: TaskView, now: Date): Prisma.TaskWhereInput {
  const { end: todayEnd } = berlinDayRangeUtc(now);
  const upcomingEnd = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  switch (view) {
    case "overdue":
      return { status: { not: "COMPLETED" }, dueAt: { lt: now } };
    case "today":
      // "Heute, aber noch nicht überfällig" - ein für 10 Uhr fälliges Task
      // taucht ab 10:01 Uhr unter "Überfällig" auf, nicht mehr unter
      // "Heute" (siehe isTaskUpcoming/isTaskOverdue - exklusive Kategorien).
      return { status: { not: "COMPLETED" }, dueAt: { gte: now, lte: todayEnd } };
    case "upcoming":
      return { status: { not: "COMPLETED" }, dueAt: { gt: todayEnd, lte: upcomingEnd } };
    case "done":
      return { status: "COMPLETED" };
    case "open":
      return { status: { not: "COMPLETED" } };
    case "all":
    default:
      return {};
  }
}

function baseWhere(filters: TaskFilters, now: Date): Prisma.TaskWhereInput {
  return {
    deletedAt: null,
    status: filters.status,
    priority: filters.priority,
    assignedUserId: filters.assignedUserId,
    ...viewWhere(filters.view, now),
    OR: filters.q
      ? [
          { title: { contains: filters.q, mode: "insensitive" } },
          { description: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
          { lead: { title: { contains: filters.q, mode: "insensitive" } } },
          { deal: { name: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}

const TASK_LIST_INCLUDE = {
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  lead: { select: { id: true, title: true } },
  deal: { select: { id: true, name: true } },
  assignedUser: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TaskInclude;

export async function listTasks(
  filters: TaskFilters,
  pagination: PaginationParams,
  now = new Date(),
) {
  const where = baseWhere(filters, now);
  const { skip, take } = toSkipTake(pagination);

  // Status explizit noch als Sekundärsortierung mitzugeben wäre hier nur
  // Komplexität ohne fachlichen Mehrwert - `sort`/`direction` genügen für
  // Version 1 vollständig (gleiche Entscheidung wie bei Lead/Deal).
  const [tasks, totalCount] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { [filters.sort]: filters.direction },
      skip,
      take,
      include: TASK_LIST_INCLUDE,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    tasks,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
  };
}

export async function getTaskById(id: string) {
  return prisma.task.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      lead: { select: { id: true, title: true } },
      deal: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

const TASK_COMPACT_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueAt: true,
} satisfies Prisma.TaskSelect;

// Für die kompakten Aufgaben-Sektionen auf Company-/Contact-/Lead-/Deal-
// Detailseiten (siehe Vorgabe Punkt 33): bewusst nur offene Aufgaben, nicht
// sämtliche erledigten standardmäßig mit anzeigen.
async function listOpenTasksFor(where: Prisma.TaskWhereInput) {
  return prisma.task.findMany({
    where: { ...where, deletedAt: null, status: { not: "COMPLETED" } },
    orderBy: { dueAt: "asc" },
    select: TASK_COMPACT_SELECT,
  });
}

export async function listTasksForCompany(companyId: string) {
  return listOpenTasksFor({ companyId });
}
export async function listTasksForContact(contactId: string) {
  return listOpenTasksFor({ contactId });
}
export async function listTasksForLead(leadId: string) {
  return listOpenTasksFor({ leadId });
}
export async function listTasksForDeal(dealId: string) {
  return listOpenTasksFor({ dealId });
}

// Dashboard-Aggregation: echte Zählungen statt Stub, effizient über
// `count()` statt das vollständige Ergebnis zu laden (keine N+1 - zwei
// gezielte COUNT-Queries statt eine Liste pro Kennzahl).
export async function getTaskDashboardSummary(now = new Date()) {
  const { end: todayEnd } = berlinDayRangeUtc(now);

  const [openTasks, dueToday, overdue] = await Promise.all([
    prisma.task.count({ where: { deletedAt: null, status: { not: "COMPLETED" } } }),
    prisma.task.count({
      where: {
        deletedAt: null,
        status: { not: "COMPLETED" },
        dueAt: { gte: now, lte: todayEnd },
      },
    }),
    prisma.task.count({
      where: { deletedAt: null, status: { not: "COMPLETED" }, dueAt: { lt: now } },
    }),
  ]);

  return { openTasks, dueToday, overdue };
}

// Für die Dashboard-Sektion "Aufgaben heute" (siehe Vorgabe Punkt 23) -
// maximal 5 Einträge, sortiert nach Priorität dann Fälligkeit.
export async function listTodaysTasksForDashboard(now = new Date(), take = 5) {
  const { end: todayEnd } = berlinDayRangeUtc(now);

  return prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "COMPLETED" },
      dueAt: { gte: now, lte: todayEnd },
    },
    orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    take,
    include: TASK_LIST_INCLUDE,
  });
}

// Reminder-Grundlage (siehe Vorgabe Punkt 30): liefert alle Aufgaben, deren
// Erinnerungszeitpunkt erreicht oder überschritten ist. Noch KEIN
// Scheduler, keine E-Mail, keine Push-Notification - nur die Query, die
// eine spätere Benachrichtigungsfunktion verwenden würde.
export async function getTasksWithDueReminders(now = new Date()) {
  return prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "COMPLETED" },
      reminderAt: { not: null, lte: now },
    },
    orderBy: { reminderAt: "asc" },
    include: TASK_LIST_INCLUDE,
  });
}
