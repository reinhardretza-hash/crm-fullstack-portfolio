import { describe, expect, it } from "vitest";
import { isTaskDueToday, isTaskOverdue, isTaskUpcoming } from "@/modules/tasks/due";

describe("isTaskOverdue", () => {
  it("is overdue when dueAt is in the past and status is not COMPLETED", () => {
    const task = { status: "OPEN" as const, dueAt: new Date("2026-06-14T10:00:00Z") };
    const now = new Date("2026-06-15T10:00:00Z");
    expect(isTaskOverdue(task, now)).toBe(true);
  });

  it("is NOT overdue when dueAt is in the future", () => {
    const task = { status: "OPEN" as const, dueAt: new Date("2026-06-16T10:00:00Z") };
    const now = new Date("2026-06-15T10:00:00Z");
    expect(isTaskOverdue(task, now)).toBe(false);
  });

  it("is NEVER overdue when the task is already COMPLETED, no matter how far in the past", () => {
    const task = { status: "COMPLETED" as const, dueAt: new Date("2020-01-01T00:00:00Z") };
    expect(isTaskOverdue(task, new Date("2026-06-15T10:00:00Z"))).toBe(false);
  });
});

describe("isTaskDueToday - Europe/Berlin Kalendertag, nicht UTC", () => {
  it("is due today when the Berlin calendar day matches", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { dueAt: new Date("2026-06-15T20:00:00Z") };
    expect(isTaskDueToday(task, now)).toBe(true);
  });

  it("is NOT due today for yesterday", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { dueAt: new Date("2026-06-14T10:00:00Z") };
    expect(isTaskDueToday(task, now)).toBe(false);
  });

  it("is NOT due today for tomorrow", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { dueAt: new Date("2026-06-16T10:00:00Z") };
    expect(isTaskDueToday(task, now)).toBe(false);
  });

  it("treats a UTC-late-evening instant as already the next Berlin day (summer, UTC+2)", () => {
    // 22:30 UTC on Jun 15 = 00:30 Berlin on Jun 16.
    const now = new Date("2026-06-16T08:00:00Z");
    const task = { dueAt: new Date("2026-06-15T22:30:00Z") };
    expect(isTaskDueToday(task, now)).toBe(true);
  });

  it("treats a UTC-late-evening instant as already the next Berlin day (winter, UTC+1)", () => {
    // 23:30 UTC on Jan 15 = 00:30 Berlin on Jan 16.
    const now = new Date("2026-01-16T08:00:00Z");
    const task = { dueAt: new Date("2026-01-15T23:30:00Z") };
    expect(isTaskDueToday(task, now)).toBe(true);
  });
});

describe("isTaskUpcoming - offen, nicht überfällig, nicht heute, innerhalb des Zeitfensters", () => {
  it("is upcoming for a task due in 3 days", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { status: "OPEN" as const, dueAt: new Date("2026-06-18T10:00:00Z") };
    expect(isTaskUpcoming(task, now)).toBe(true);
  });

  it("is NOT upcoming when overdue", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { status: "OPEN" as const, dueAt: new Date("2026-06-14T10:00:00Z") };
    expect(isTaskUpcoming(task, now)).toBe(false);
  });

  it("is NOT upcoming when due today", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { status: "OPEN" as const, dueAt: new Date("2026-06-15T20:00:00Z") };
    expect(isTaskUpcoming(task, now)).toBe(false);
  });

  it("is NOT upcoming when already COMPLETED", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { status: "COMPLETED" as const, dueAt: new Date("2026-06-18T10:00:00Z") };
    expect(isTaskUpcoming(task, now)).toBe(false);
  });

  it("is NOT upcoming outside the configured window (more than 7 days ahead)", () => {
    const now = new Date("2026-06-15T10:00:00Z");
    const task = { status: "OPEN" as const, dueAt: new Date("2026-07-15T10:00:00Z") };
    expect(isTaskUpcoming(task, now)).toBe(false);
  });
});
