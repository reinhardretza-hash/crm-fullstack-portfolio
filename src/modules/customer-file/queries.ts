import type { Prisma, User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { berlinDayRangeUtc } from "@/lib/timezone";
import { REMINDER_TYPE_LABELS } from "@/modules/reminders/rules";
import { listAttentionReminders, reminderScopeWhere } from "@/modules/reminders/queries";
import { pickNextStep, type NextStepItem } from "./next-step";
import { scopeWhere, type FileScope } from "./scope";

// Alle Kundenakten-Abfragen sind begrenzt und gezielt (kein N+1, keine
// komplette Historie). Gelöschte Datensätze (deletedAt) werden nie gezeigt.

// Leads, die EINDEUTIG zur Akte gehören: Company/Contact über die direkte
// Beziehung, Deal nur über seinen eigenen Lead. Sonst wird nichts geraten.
function leadWhereFor(scope: FileScope, dealLeadId: string | null): Prisma.LeadWhereInput | null {
  if (scope.kind === "company") return { companyId: scope.id };
  if (scope.kind === "contact") return { contactId: scope.id };
  return dealLeadId ? { id: dealLeadId } : null;
}

export async function getNextStep(
  scope: FileScope,
  user: Pick<User, "id" | "role">,
  options: { dealLeadId?: string | null; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const todayEnd = berlinDayRangeUtc(now).end;
  const leadWhere = leadWhereFor(scope, options.dealLeadId ?? null);

  const [tasks, leads, events, reminders] = await Promise.all([
    prisma.task.findMany({
      where: { ...scopeWhere(scope), deletedAt: null, status: { not: "COMPLETED" } },
      orderBy: { dueAt: "asc" },
      take: 4,
      select: { id: true, title: true, dueAt: true },
    }),
    leadWhere
      ? prisma.lead.findMany({
          where: { ...leadWhere, deletedAt: null, status: "OPEN", nextFollowUpAt: { not: null } },
          orderBy: { nextFollowUpAt: "asc" },
          take: 3,
          select: { id: true, title: true, nextFollowUpAt: true },
        })
      : Promise.resolve([]),
    prisma.calendarEvent.findMany({
      where: { ...scopeWhere(scope), deletedAt: null, status: "SCHEDULED", startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 2,
      select: { id: true, title: true, startsAt: true },
    }),
    listAttentionReminders(user, {
      scope: reminderScopeWhere({ ...scope, leadId: options.dealLeadId }),
      limit: 3,
    }),
  ]);

  const items: NextStepItem[] = [];
  for (const task of tasks) {
    items.push({
      kind: task.dueAt < now ? "TASK_OVERDUE" : "TASK_UPCOMING",
      title: task.title,
      href: `/tasks/${task.id}`,
      at: task.dueAt,
    });
  }
  for (const lead of leads) {
    if (!lead.nextFollowUpAt) continue;
    items.push({
      kind: lead.nextFollowUpAt <= todayEnd ? "FOLLOW_UP_DUE" : "FOLLOW_UP_UPCOMING",
      title: lead.title,
      href: `/leads/${lead.id}`,
      at: lead.nextFollowUpAt,
    });
  }
  for (const event of events) {
    items.push({
      kind: "EVENT",
      title: event.title,
      href: `/calendar/${event.id}`,
      at: event.startsAt,
    });
  }
  for (const reminder of reminders.items) {
    items.push({
      kind: "REMINDER",
      title: `${REMINDER_TYPE_LABELS[reminder.type]}${reminder.target ? `: ${reminder.target.label}` : ""}`,
      href: reminder.target?.href ?? null,
      at: null,
    });
  }
  return pickNextStep(items);
}

export async function listRemindersFor(
  scope: FileScope,
  user: Pick<User, "id" | "role">,
  dealLeadId?: string | null,
) {
  return listAttentionReminders(user, {
    scope: reminderScopeWhere({ ...scope, leadId: dealLeadId }),
    limit: 5,
  });
}

export async function listRecentNotes(scope: FileScope, take = 5) {
  const where = { ...scopeWhere(scope) };
  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: { author: { select: { firstName: true, lastName: true } } },
    }),
    prisma.note.count({ where }),
  ]);
  return { notes, total };
}

// Offene zuerst (überfällig/heute/kommend, nach Fälligkeit), nie erledigte.
export async function listOpenTasksCompact(scope: FileScope, take = 5) {
  const where: Prisma.TaskWhereInput = {
    ...scopeWhere(scope),
    deletedAt: null,
    status: { not: "COMPLETED" },
  };
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: { dueAt: "asc" },
      take,
      select: {
        id: true,
        title: true,
        dueAt: true,
        priority: true,
        status: true,
        assignedUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.task.count({ where }),
  ]);
  return { tasks, total };
}

export async function listUpcomingEventsCompact(scope: FileScope, take = 5, now = new Date()) {
  return prisma.calendarEvent.findMany({
    where: { ...scopeWhere(scope), deletedAt: null, status: "SCHEDULED", startsAt: { gte: now } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true, title: true, startsAt: true },
  });
}

export async function listEmailsCompact(scope: FileScope, take = 5) {
  return prisma.emailMessage.findMany({
    where: scopeWhere(scope),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      status: true,
      toEmail: true,
      subject: true,
      createdAt: true,
      sentByUser: { select: { firstName: true, lastName: true } },
    },
  });
}

// Angebote/Rechnungen: offene zuerst (nicht Entwurf-abgeschlossen), dann neueste.
export async function listQuotesCompact(scope: FileScope, take = 5) {
  const where = { ...scopeWhere(scope), deletedAt: null };
  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        totalCents: true,
        issueDate: true,
        validUntil: true,
      },
    }),
    prisma.quote.count({ where }),
  ]);
  return { quotes, total };
}

export async function listInvoicesCompact(scope: FileScope, take = 5) {
  const where = { ...scopeWhere(scope), deletedAt: null };
  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalCents: true,
        issueDate: true,
        dueDate: true,
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { invoices, total };
}
