import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/rbac", () => ({ requireUser: vi.fn() }));
import { strictBerlinTimeToUtc, addCalendarDays, dateKeyInTimeZone } from "@/lib/timezone";
import {
  eventFormSchema,
  eventMutationSchema,
  calendarFiltersSchema,
} from "@/validations/calendar";
import {
  eventsOverlap,
  canTransitionEvent,
  calendarDayInterval,
  monthDays,
  formatDuration,
  formatEventWhen,
} from "@/modules/calendar/helpers";
import { calendarWhere } from "@/modules/calendar/queries";
const input = {
  title: "Demo",
  assignedUserId: "user",
  startDate: "2026-01-15",
  endDate: "2026-01-15",
  startTime: "10:00",
  endTime: "11:30",
  allDay: false,
};
describe("calendar time and validation", () => {
  it.each([
    ["2026-01-15", "2026-01-15T09:00:00.000Z"],
    ["2026-07-15", "2026-07-15T08:00:00.000Z"],
  ])("converts Berlin time on %s", (date, expected) =>
    expect(strictBerlinTimeToUtc(date, "10:00").toISOString()).toBe(expected),
  );
  it("keeps midnight on its Berlin date despite previous UTC day", () => {
    const utc = strictBerlinTimeToUtc("2026-07-15", "00:00");
    expect(utc.toISOString()).toBe("2026-07-14T22:00:00.000Z");
    expect(dateKeyInTimeZone(utc)).toBe("2026-07-15");
  });
  it.each(["2026-03-29", "2026-10-25"])(
    "rejects nonexistent or ambiguous DST wall time %s",
    (date) => expect(() => strictBerlinTimeToUtc(date, "02:30")).toThrow(/Zeitumstellung/),
  );
  it.each([
    ["2026-03-29", 23],
    ["2026-10-25", 25],
    ["2026-01-15", 24],
    ["2026-07-15", 24],
  ])("all-day %s is a local calendar day (%i hours)", (date, hours) => {
    const event = eventFormSchema.parse({
      ...input,
      startDate: date,
      endDate: date,
      allDay: true,
      startTime: undefined,
      endTime: undefined,
    });
    expect((event.endsAt.getTime() - event.startsAt.getTime()) / 3600000).toBe(hours);
    expect(dateKeyInTimeZone(event.startsAt)).toBe(date);
    expect(dateKeyInTimeZone(event.endsAt)).toBe(addCalendarDays(date, 1));
    expect(formatDuration(event)).toBe("1 Tag");
    expect(formatEventWhen(event)).toContain("Ganztägig");
  });
  it.each([
    { title: "" },
    { title: "x".repeat(201) },
    { description: "x".repeat(10001) },
    { location: "x".repeat(301) },
    { assignedUserId: "" },
    { startDate: "2026-02-30" },
    { endTime: "10:00" },
    { endTime: "09:00" },
    { startTime: "25:00" },
    { startTime: undefined },
    { allDay: true, endDate: "2026-01-14" },
  ])("rejects invalid form %j", (change) =>
    expect(eventFormSchema.safeParse({ ...input, ...change }).success).toBe(false),
  );
  it("multi-day all-day inclusive end does not shift UI date", () => {
    const v = eventFormSchema.parse({
      ...input,
      startDate: "2026-03-28",
      endDate: "2026-03-30",
      allDay: true,
    });
    expect(v.endsAt.toISOString()).toBe("2026-03-30T22:00:00.000Z");
    expect(formatDuration(v)).toBe("3 Tage");
  });
  it("validates strict positive OCC version", () => {
    expect(eventMutationSchema.safeParse({ id: "id", expectedVersion: 1 }).success).toBe(true);
    for (const version of [0, -1, 1.5, NaN])
      expect(eventMutationSchema.safeParse({ id: "id", expectedVersion: version }).success).toBe(
        false,
      );
  });
  it("duration is calculated, not stored", () =>
    expect(formatDuration(eventFormSchema.parse(input))).toBe("1 Std. 30 Min."));
  it("month layout starts Monday, contains whole weeks and leap day", () => {
    const days = monthDays("2028-02-12");
    expect(new Date(`${days[0]}T12:00Z`).getUTCDay()).toBe(1);
    expect(days.length % 7).toBe(0);
    expect(days).toContain("2028-02-29");
  });
  it.each([
    ["SCHEDULED", "COMPLETED", true],
    ["SCHEDULED", "CANCELLED", true],
    ["COMPLETED", "SCHEDULED", true],
    ["CANCELLED", "SCHEDULED", true],
    ["COMPLETED", "CANCELLED", false],
    ["SCHEDULED", "SCHEDULED", false],
  ] as const)("transition %s -> %s", (a, b, valid) => expect(canTransitionEvent(a, b)).toBe(valid));
  it("half-open overlap permits adjacent events", () => {
    const a = calendarDayInterval("2026-03-29"),
      b = calendarDayInterval("2026-03-30");
    expect(eventsOverlap(a, b)).toBe(false);
    expect(eventsOverlap(a, a)).toBe(true);
    expect(eventsOverlap({ ...a, endsAt: new Date(b.startsAt.getTime() + 1) }, b)).toBe(true);
  });
  it("filter always hides deleted and mine overrides user filter", () => {
    const filters = calendarFiltersSchema.parse({
      scope: "mine",
      userId: "other",
      status: "CANCELLED",
      crmType: "lead",
      dateFrom: "2026-07-15",
      dateTo: "2026-07-15",
    });
    expect(calendarWhere(filters, "me")).toMatchObject({
      deletedAt: null,
      assignedUserId: "me",
      status: "CANCELLED",
      leadId: { not: null },
      startsAt: { lt: new Date("2026-07-15T22:00Z") },
      endsAt: { gt: new Date("2026-07-14T22:00Z") },
    });
  });
  it("invalid filters are rejected", () => {
    for (const change of [
      { status: "OTHER" },
      { dateFrom: "2026-02-30" },
      { dateFrom: "2026-02-02", dateTo: "2026-02-01" },
      { view: "week" },
    ])
      expect(calendarFiltersSchema.safeParse(change).success).toBe(false);
  });
  it("all-day and month interval remain valid at the supported upper year boundary", () => {
    const event = eventFormSchema.parse({
      ...input,
      startDate: "2200-12-31",
      endDate: "2200-12-31",
      allDay: true,
    });
    expect(dateKeyInTimeZone(event.endsAt)).toBe("2201-01-01");
    for (const day of monthDays("2200-12-31"))
      expect(calendarDayInterval(day).endsAt > calendarDayInterval(day).startsAt).toBe(true);
  });
  it("month bounds and explicit date filters both constrain the query", () => {
    const range = calendarDayInterval("2026-07-15");
    expect(
      calendarWhere(
        calendarFiltersSchema.parse({ dateFrom: "2026-07-20", dateTo: "2026-07-21" }),
        "me",
        range,
      ),
    ).toMatchObject({
      startsAt: { lt: strictBerlinTimeToUtc("2026-07-22", "00:00") },
      endsAt: { gt: strictBerlinTimeToUtc("2026-07-20", "00:00") },
      AND: [{ startsAt: { lt: range.endsAt }, endsAt: { gt: range.startsAt } }],
    });
  });
});
