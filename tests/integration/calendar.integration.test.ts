import { randomUUID } from "node:crypto";
import { beforeEach, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));
let userId: string | null = null;
vi.mock("@/server/rbac", () => ({
  requireUser: async () => {
    if (!userId) throw new Error("AUTH_REQUIRED");
    const user = await prisma.user.findFirst({ where: { id: userId, isActive: true } });
    if (!user) throw new Error("AUTH_REQUIRED");
    return user;
  },
}));
import {
  saveCalendarEvent,
  changeCalendarEvent,
  EVENT_CONFLICT_MESSAGE,
} from "@/modules/calendar/service";
import {
  getCalendarEvent,
  listCalendarEvents,
  upcomingCalendarEvents,
  findCalendarOverlaps,
} from "@/modules/calendar/queries";
import { saveEventAction, changeEventAction } from "@/modules/calendar/actions";
import { calendarFiltersSchema } from "@/validations/calendar";
let companyId: string, contactId: string, leadId: string, dealId: string, taskId: string;
const input = (extra: Record<string, unknown> = {}) => ({
  title: "Calendar fixture",
  description: "Private calendar description",
  location: "Test room",
  assignedUserId: userId,
  startDate: "2026-10-02",
  endDate: "2026-10-02",
  startTime: "10:00",
  endTime: "11:00",
  allDay: false,
  ...extra,
});
const page = { page: 1, pageSize: 25 as const };
beforeEach(async () => {
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: randomUUID(),
      firstName: "Calendar",
      lastName: "Tester",
      role: "USER",
    },
  });
  userId = user.id;
  const company = await prisma.company.create({ data: { name: "Calendar Company" } });
  companyId = company.id;
  const contact = await prisma.contact.create({
    data: { firstName: "Calendar", lastName: "Contact", companyId },
  });
  contactId = contact.id;
  const pipeline = await prisma.pipeline.create({ data: { name: "Calendar Pipeline" } });
  const stage = await prisma.pipelineStage.create({
    data: { name: "Open", position: 1, pipelineId: pipeline.id },
  });
  const lead = await prisma.lead.create({
    data: {
      title: "Calendar Lead",
      companyId,
      contactId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      assignedUserId: userId,
    },
  });
  leadId = lead.id;
  const deal = await prisma.deal.create({
    data: {
      name: "Calendar Deal",
      companyId,
      contactId,
      leadId,
      service: "WEBSITE",
      valueCents: 100,
      assignedUserId: userId,
    },
  });
  dealId = deal.id;
  const task = await prisma.task.create({
    data: {
      title: "Prepare fixture",
      leadId,
      assignedUserId: userId,
      createdById: userId,
      dueAt: new Date("2026-10-02T07:00Z"),
    },
  });
  taskId = task.id;
});
it.each(["OWNER", "ADMIN", "USER"] as const)("active %s may create", async (role) => {
  await prisma.user.update({ where: { id: userId! }, data: { role } });
  const event = await saveCalendarEvent(userId!, input());
  expect(event.createdById).toBe(userId);
  expect(event.status).toBe("SCHEDULED");
  expect(event.version).toBe(1);
});
it.each(["companyId", "contactId", "leadId", "dealId"] as const)(
  "resolves %s relations",
  async (key) => {
    const ids = { companyId, contactId, leadId, dealId };
    const event = await saveCalendarEvent(userId!, input({ [key]: ids[key] }));
    expect(event[key]).toBe(ids[key]);
    expect(event.companyId).toBe(companyId);
    if (key === "dealId") expect(event).toMatchObject({ contactId, leadId });
  },
);
it("task merges coherent context without changing task or follow-up", async () => {
  const event = await saveCalendarEvent(userId!, input({ taskId, dealId }));
  expect(event).toMatchObject({ taskId, dealId, leadId, companyId, contactId });
  await changeCalendarEvent(userId!, { id: event.id, expectedVersion: 1 }, "COMPLETED");
  expect((await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("OPEN");
  expect(
    (await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).nextFollowUpAt,
  ).toBeNull();
});
it("completing task does not complete event", async () => {
  const event = await saveCalendarEvent(userId!, input({ taskId }));
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
  expect((await getCalendarEvent(event.id))?.status).toBe("SCHEDULED");
});
it("rejects inconsistent CRM/task targets", async () => {
  const other = await prisma.company.create({ data: { name: "Other" } });
  await expect(saveCalendarEvent(userId!, input({ dealId, companyId: other.id }))).rejects.toThrow(
    /gehören nicht/,
  );
  await expect(saveCalendarEvent(userId!, input({ taskId, companyId: other.id }))).rejects.toThrow(
    /gehören nicht/,
  );
  expect(await prisma.calendarEvent.count()).toBe(0);
});
it.each(["company", "contact", "lead", "deal", "task"] as const)(
  "rejects deleted %s",
  async (entity) => {
    const map = {
      company: companyId,
      contact: contactId,
      lead: leadId,
      deal: dealId,
      task: taskId,
    };
    const id = map[entity];
    if (entity === "company")
      await prisma.company.update({ where: { id }, data: { deletedAt: new Date() } });
    if (entity === "contact")
      await prisma.contact.update({ where: { id }, data: { deletedAt: new Date() } });
    if (entity === "lead")
      await prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    if (entity === "deal")
      await prisma.deal.update({ where: { id }, data: { deletedAt: new Date() } });
    if (entity === "task")
      await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await expect(saveCalendarEvent(userId!, input({ [`${entity}Id`]: id }))).rejects.toThrow(
      /gelöscht/,
    );
  },
);
it("rejects inactive assignee and inactive actor", async () => {
  const id = userId!;
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  await expect(saveCalendarEvent(id, input())).rejects.toThrow();
});
it("edits with OCC and records reschedule separately", async () => {
  const event = await saveCalendarEvent(userId!, input({ dealId }));
  const updated = await saveCalendarEvent(
    userId!,
    input({ dealId, startTime: "12:00", endTime: "13:00" }),
    { id: event.id, expectedVersion: 1 },
  );
  expect(updated.version).toBe(2);
  expect(
    await prisma.activity.count({
      where: { type: "CALENDAR_EVENT_RESCHEDULED", calendarEventId: event.id },
    }),
  ).toBe(1);
  await expect(
    saveCalendarEvent(userId!, input(), { id: event.id, expectedVersion: 1 }),
  ).rejects.toThrow(EVENT_CONFLICT_MESSAGE);
});
it("exactly one parallel update wins", async () => {
  const event = await saveCalendarEvent(userId!, input());
  const results = await Promise.allSettled([
    saveCalendarEvent(userId!, input({ title: "A" }), { id: event.id, expectedVersion: 1 }),
    saveCalendarEvent(userId!, input({ title: "B" }), { id: event.id, expectedVersion: 1 }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((r) => r.status === "rejected");
  expect(rejected?.status === "rejected" && rejected.reason.message).toBe(EVENT_CONFLICT_MESSAGE);
  expect((await getCalendarEvent(event.id))?.version).toBe(2);
  expect(
    await prisma.auditLog.count({
      where: { action: "CALENDAR_EVENT_UPDATED", entityId: event.id },
    }),
  ).toBe(1);
});
it("status transitions complete/reopen/cancel/reopen", async () => {
  let e = await saveCalendarEvent(userId!, input({ contactId }));
  for (const status of ["COMPLETED", "SCHEDULED", "CANCELLED", "SCHEDULED"] as const) {
    e = await changeCalendarEvent(userId!, { id: e.id, expectedVersion: e.version }, status);
    expect(e.status).toBe(status);
  }
  expect(e.version).toBe(5);
  expect(await prisma.activity.count({ where: { calendarEventId: e.id } })).toBe(5);
});
it("refuses completed to cancelled and no-op", async () => {
  let e = await saveCalendarEvent(userId!, input());
  await expect(
    changeCalendarEvent(userId!, { id: e.id, expectedVersion: 1 }, "SCHEDULED"),
  ).rejects.toThrow(/nicht möglich/);
  e = await changeCalendarEvent(userId!, { id: e.id, expectedVersion: 1 }, "COMPLETED");
  await expect(
    changeCalendarEvent(userId!, { id: e.id, expectedVersion: 2 }, "CANCELLED"),
  ).rejects.toThrow(/nicht möglich/);
});
it("soft delete hides all normal queries and prevents later mutations", async () => {
  const e = await saveCalendarEvent(userId!, input());
  await changeCalendarEvent(userId!, { id: e.id, expectedVersion: 1 }, "DELETE");
  expect(await getCalendarEvent(e.id)).toBeNull();
  expect((await listCalendarEvents(calendarFiltersSchema.parse({}), page)).totalCount).toBe(0);
  expect(await upcomingCalendarEvents({}, new Date("2026-10-01"))).toHaveLength(0);
  await expect(
    saveCalendarEvent(userId!, input(), { id: e.id, expectedVersion: 2 }),
  ).rejects.toThrow(/nicht gefunden/);
  expect(
    await prisma.auditLog.count({ where: { action: "CALENDAR_EVENT_DELETED", entityId: e.id } }),
  ).toBe(1);
});
it("writes CRM activities and minimal audit atomically", async () => {
  const e = await saveCalendarEvent(userId!, input({ dealId }));
  const activity = await prisma.activity.findFirstOrThrow({ where: { calendarEventId: e.id } });
  expect(activity).toMatchObject({
    companyId,
    contactId,
    leadId,
    dealId,
    type: "CALENDAR_EVENT_CREATED",
  });
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: e.id } });
  expect(JSON.stringify(audit.metadata)).not.toContain("Private calendar description");
  expect(JSON.stringify(audit.metadata)).not.toContain("Calendar fixture");
  expect(audit.metadata).toMatchObject({ calendarEventId: e.id, status: "SCHEDULED", version: 1 });
});
it("overlap warns but permits booking; ignores cancelled/deleted and adjacency", async () => {
  const first = await saveCalendarEvent(userId!, input());
  const second = await saveCalendarEvent(userId!, input({ startTime: "10:30", endTime: "11:30" }));
  expect(await findCalendarOverlaps(second)).toEqual([{ id: first.id, title: first.title }]);
  const adjacent = await saveCalendarEvent(
    userId!,
    input({ startTime: "11:30", endTime: "12:30" }),
  );
  expect(await findCalendarOverlaps(adjacent)).toHaveLength(0);
  await changeCalendarEvent(userId!, { id: first.id, expectedVersion: 1 }, "CANCELLED");
  expect(await findCalendarOverlaps(second)).toHaveLength(0);
  await changeCalendarEvent(userId!, { id: adjacent.id, expectedVersion: 1 }, "DELETE");
  expect(await prisma.calendarEvent.count()).toBe(3);
});
it("searches all CRM text targets and filters user/status/context/date", async () => {
  await saveCalendarEvent(userId!, input({ dealId }));
  for (const q of [
    "Calendar fixture",
    "Calendar Company",
    "Contact",
    "Calendar Lead",
    "Calendar Deal",
  ]) {
    expect((await listCalendarEvents(calendarFiltersSchema.parse({ q }), page)).totalCount).toBe(1);
  }
  expect(
    (await listCalendarEvents(calendarFiltersSchema.parse({ status: "CANCELLED" }), page))
      .totalCount,
  ).toBe(0);
  expect(
    (await listCalendarEvents(calendarFiltersSchema.parse({ crmType: "none" }), page)).totalCount,
  ).toBe(0);
  expect(
    (
      await listCalendarEvents(
        calendarFiltersSchema.parse({
          scope: "mine",
          userId: "other",
          dateFrom: "2026-10-02",
          dateTo: "2026-10-02",
        }),
        page,
      )
    ).totalCount,
  ).toBe(1);
  expect(
    (await listCalendarEvents(calendarFiltersSchema.parse({ dateFrom: "2026-10-03" }), page))
      .totalCount,
  ).toBe(0);
});
it("pagination is server-side and stable", async () => {
  for (let i = 0; i < 27; i++) await saveCalendarEvent(userId!, input({ title: `Event ${i}` }));
  const first = await listCalendarEvents(calendarFiltersSchema.parse({}), page);
  const second = await listCalendarEvents(calendarFiltersSchema.parse({}), { ...page, page: 2 });
  expect(first.events).toHaveLength(25);
  expect(second.events).toHaveLength(2);
  expect(first.totalPages).toBe(2);
  expect(first.events.some((a) => second.events.some((b) => a.id === b.id))).toBe(false);
});
it("dashboard only returns next five scheduled future events", async () => {
  for (let i = 0; i < 7; i++)
    await saveCalendarEvent(
      userId!,
      input({ startDate: `2026-10-0${i + 1}`, endDate: `2026-10-0${i + 1}` }),
    );
  const list = await upcomingCalendarEvents({}, new Date("2026-10-02T09:00Z"));
  expect(list).toHaveLength(5);
  expect(
    list.every((e) => e.status === "SCHEDULED" && e.startsAt >= new Date("2026-10-02T09:00Z")),
  ).toBe(true);
});
it("rejects unauthenticated direct queries and actions", async () => {
  userId = null;
  await expect(getCalendarEvent("id")).rejects.toThrow("AUTH_REQUIRED");
  await expect(saveEventAction(null, { error: null }, new FormData())).rejects.toThrow(
    "AUTH_REQUIRED",
  );
  await expect(changeEventAction("id", 1, "DELETE", { error: null })).rejects.toThrow(
    "AUTH_REQUIRED",
  );
});
it("DB duration check protects writes bypassing application validation", async () => {
  await expect(
    prisma.calendarEvent.create({
      data: {
        title: "Invalid",
        assignedUserId: userId!,
        createdById: userId!,
        startsAt: new Date("2026-10-01"),
        endsAt: new Date("2026-10-01"),
      },
    }),
  ).rejects.toThrow();
});
it("inactive assignee cannot receive a new appointment", async () => {
  const inactive = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: randomUUID(),
      firstName: "Inactive",
      lastName: "Fixture",
      isActive: false,
    },
  });
  await expect(saveCalendarEvent(userId!, input({ assignedUserId: inactive.id }))).rejects.toThrow(
    /aktiven Verantwortlichen/,
  );
});
it("stale status and delete requests preserve the winner", async () => {
  const e = await saveCalendarEvent(userId!, input());
  await saveCalendarEvent(userId!, input({ title: "Winner" }), { id: e.id, expectedVersion: 1 });
  await expect(
    changeCalendarEvent(userId!, { id: e.id, expectedVersion: 1 }, "CANCELLED"),
  ).rejects.toThrow(EVENT_CONFLICT_MESSAGE);
  await expect(
    changeCalendarEvent(userId!, { id: e.id, expectedVersion: 1 }, "DELETE"),
  ).rejects.toThrow(EVENT_CONFLICT_MESSAGE);
  expect((await getCalendarEvent(e.id))?.title).toBe("Winner");
});
