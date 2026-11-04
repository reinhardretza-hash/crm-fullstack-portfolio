import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import type { Prisma } from "@/generated/prisma/client";
import { eventFormSchema, eventMutationSchema } from "@/validations/calendar";
import { resolveEmailContext, mergeEmailContext } from "@/modules/email/context";
import { logActivity } from "@/modules/activity/log";
import { writeCrmAuditLog, type CrmAuditAction } from "@/modules/audit/log";
import { canTransitionEvent, type EventStatus } from "./helpers";
import type { EmailContext } from "@/validations/email";

export const EVENT_CONFLICT_MESSAGE =
  "Der Termin wurde zwischenzeitlich geändert. Bitte die Seite neu laden.";
async function actor(tx: Prisma.TransactionClient, userId: string) {
  if (!(await tx.user.findFirst({ where: { id: userId, isActive: true } })))
    throw new ForbiddenError();
}
async function validateRelations(
  tx: Prisma.TransactionClient,
  data: ReturnType<typeof eventFormSchema.parse>,
) {
  if (!(await tx.user.findFirst({ where: { id: data.assignedUserId, isActive: true } })))
    throw new AppError("Bitte einen aktiven Verantwortlichen auswählen.");
  let context: EmailContext = {
    companyId: data.companyId,
    contactId: data.contactId,
    leadId: data.leadId,
    dealId: data.dealId,
  };
  if (data.taskId) {
    const task = await tx.task.findFirst({ where: { id: data.taskId, deletedAt: null } });
    if (!task) throw new AppError("Aufgabe wurde nicht gefunden oder ist gelöscht.");
    context = mergeEmailContext(context, {
      companyId: task.companyId || undefined,
      contactId: task.contactId || undefined,
      leadId: task.leadId || undefined,
      dealId: task.dealId || undefined,
    });
  }
  return (await resolveEmailContext(tx, context)).context;
}
type EventRow = Prisma.CalendarEventGetPayload<object>;
async function record(
  tx: Prisma.TransactionClient,
  event: EventRow,
  userId: string,
  action: CrmAuditAction & Prisma.ActivityCreateInput["type"],
  before?: EventRow,
) {
  const context = {
    companyId: event.companyId || undefined,
    contactId: event.contactId || undefined,
    leadId: event.leadId || undefined,
    dealId: event.dealId || undefined,
  };
  await logActivity(tx, {
    ...context,
    taskId: event.taskId || undefined,
    calendarEventId: event.id,
    userId,
    type: action,
    metadata: {
      title: event.title,
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
      status: event.status,
      ...(before
        ? { oldStartsAt: before.startsAt.toISOString(), oldEndsAt: before.endsAt.toISOString() }
        : {}),
    },
  });
  await writeCrmAuditLog(tx, {
    userId,
    action,
    entityType: "CalendarEvent",
    entityId: event.id,
    metadata: {
      ...context,
      calendarEventId: event.id,
      taskId: event.taskId,
      status: event.status,
      version: event.version,
    },
  });
}
export async function saveCalendarEvent(
  userId: string,
  raw: unknown,
  mutation?: { id: string; expectedVersion: number },
) {
  const parsed = eventFormSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Bitte Eingaben prüfen.");
  const data = parsed.data;
  if (mutation) eventMutationSchema.parse(mutation);
  return prisma.$transaction(async (tx) => {
    await actor(tx, userId);
    const context = await validateRelations(tx, data);
    const payload = {
      ...data,
      ...context,
      description: data.description || null,
      location: data.location || null,
      taskId: data.taskId || null,
      companyId: context.companyId || null,
      contactId: context.contactId || null,
      leadId: context.leadId || null,
      dealId: context.dealId || null,
    };
    const before = mutation
      ? await tx.calendarEvent.findFirst({ where: { id: mutation.id, deletedAt: null } })
      : null;
    if (mutation && !before) throw new AppError("Termin wurde nicht gefunden.");
    if (mutation) {
      const result = await tx.calendarEvent.updateMany({
        where: { id: mutation.id, version: mutation.expectedVersion, deletedAt: null },
        data: { ...payload, version: { increment: 1 } },
      });
      if (!result.count) throw new AppError(EVENT_CONFLICT_MESSAGE);
    }
    const event = mutation
      ? await tx.calendarEvent.findUniqueOrThrow({ where: { id: mutation.id } })
      : await tx.calendarEvent.create({ data: { ...payload, createdById: userId } });
    const action = !before
      ? "CALENDAR_EVENT_CREATED"
      : before.startsAt.getTime() !== event.startsAt.getTime() ||
          before.endsAt.getTime() !== event.endsAt.getTime() ||
          before.allDay !== event.allDay
        ? "CALENDAR_EVENT_RESCHEDULED"
        : "CALENDAR_EVENT_UPDATED";
    await record(tx, event, userId, action, before || undefined);
    return event;
  });
}
export async function changeCalendarEvent(
  userId: string,
  mutation: { id: string; expectedVersion: number },
  status: EventStatus | "DELETE",
) {
  eventMutationSchema.parse(mutation);
  if (!["SCHEDULED", "COMPLETED", "CANCELLED", "DELETE"].includes(status))
    throw new AppError("Ungültiger Status.");
  return prisma.$transaction(async (tx) => {
    await actor(tx, userId);
    const before = await tx.calendarEvent.findFirst({
      where: { id: mutation.id, deletedAt: null },
    });
    if (!before) throw new AppError("Termin wurde nicht gefunden.");
    if (status !== "DELETE" && !canTransitionEvent(before.status, status))
      throw new AppError("Dieser Statuswechsel ist nicht möglich.");
    const updated = await tx.calendarEvent.updateMany({
      where: { id: mutation.id, version: mutation.expectedVersion, deletedAt: null },
      data: {
        ...(status === "DELETE" ? { deletedAt: new Date() } : { status }),
        version: { increment: 1 },
      },
    });
    if (!updated.count) throw new AppError(EVENT_CONFLICT_MESSAGE);
    const event = await tx.calendarEvent.findUniqueOrThrow({ where: { id: mutation.id } });
    const action =
      status === "DELETE"
        ? "CALENDAR_EVENT_DELETED"
        : status === "SCHEDULED"
          ? "CALENDAR_EVENT_REOPENED"
          : status === "COMPLETED"
            ? "CALENDAR_EVENT_COMPLETED"
            : "CALENDAR_EVENT_CANCELLED";
    await record(tx, event, userId, action);
    return event;
  });
}
