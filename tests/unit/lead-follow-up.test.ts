import { describe, expect, it } from "vitest";
import {
  isLeadFollowUpDueToday,
  isLeadFollowUpOverdue,
  isLeadFollowUpUpcoming,
} from "@/modules/leads/stage-status";

const now = new Date("2026-06-15T10:00:00Z");

describe("isLeadFollowUpOverdue", () => {
  it("OPEN + past nextFollowUpAt => overdue", () => {
    expect(
      isLeadFollowUpOverdue(
        { status: "OPEN", nextFollowUpAt: new Date("2026-06-14T10:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("WON => never overdue, regardless of the date", () => {
    expect(
      isLeadFollowUpOverdue(
        { status: "WON", nextFollowUpAt: new Date("2020-01-01T00:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("LOST => never overdue, regardless of the date", () => {
    expect(
      isLeadFollowUpOverdue(
        { status: "LOST", nextFollowUpAt: new Date("2020-01-01T00:00:00Z") },
        now,
      ),
    ).toBe(false);
  });
});

describe("isLeadFollowUpDueToday", () => {
  it("OPEN + today => due today", () => {
    expect(
      isLeadFollowUpDueToday(
        { status: "OPEN", nextFollowUpAt: new Date("2026-06-15T20:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("WON + today's date => never shown as due today", () => {
    expect(
      isLeadFollowUpDueToday(
        { status: "WON", nextFollowUpAt: new Date("2026-06-15T20:00:00Z") },
        now,
      ),
    ).toBe(false);
  });
});

describe("isLeadFollowUpUpcoming", () => {
  it("OPEN + future => upcoming", () => {
    expect(
      isLeadFollowUpUpcoming(
        { status: "OPEN", nextFollowUpAt: new Date("2026-06-20T10:00:00Z") },
        now,
      ),
    ).toBe(true);
  });

  it("OPEN + overdue date => NOT upcoming (mutually exclusive)", () => {
    expect(
      isLeadFollowUpUpcoming(
        { status: "OPEN", nextFollowUpAt: new Date("2026-06-14T10:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("OPEN + today => NOT upcoming (mutually exclusive)", () => {
    expect(
      isLeadFollowUpUpcoming(
        { status: "OPEN", nextFollowUpAt: new Date("2026-06-15T20:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("WON => never upcoming, even with a future date", () => {
    expect(
      isLeadFollowUpUpcoming(
        { status: "WON", nextFollowUpAt: new Date("2026-06-20T10:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("LOST => never upcoming, even with a future date", () => {
    expect(
      isLeadFollowUpUpcoming(
        { status: "LOST", nextFollowUpAt: new Date("2026-06-20T10:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("no nextFollowUpAt at all => not upcoming", () => {
    expect(isLeadFollowUpUpcoming({ status: "OPEN", nextFollowUpAt: null }, now)).toBe(false);
  });
});
