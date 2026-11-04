import { describe, expect, it } from "vitest";
import {
  combineDateAndOptionalTime,
  dateKeyInTimeZone,
  isSameDayInTimeZone,
  zonedTimeToUtc,
} from "@/lib/timezone";

describe("zonedTimeToUtc - Winterzeit (CET, UTC+1)", () => {
  it("converts a Berlin wall-clock time in January to the correct UTC instant", () => {
    const utc = zonedTimeToUtc(2026, 1, 15, 14, 30, 0);
    expect(utc.toISOString()).toBe("2026-01-15T13:30:00.000Z");
  });
});

describe("zonedTimeToUtc - Sommerzeit (CEST, UTC+2)", () => {
  it("converts a Berlin wall-clock time in July to the correct UTC instant", () => {
    const utc = zonedTimeToUtc(2026, 7, 15, 14, 30, 0);
    expect(utc.toISOString()).toBe("2026-07-15T12:30:00.000Z");
  });
});

describe("combineDateAndOptionalTime", () => {
  it("uses the given time when provided", () => {
    const result = combineDateAndOptionalTime("2026-07-01", "09:00");
    expect(result.toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });

  it("defaults to 23:59:59 Berlin (end of day) when no time is given - in winter", () => {
    const result = combineDateAndOptionalTime("2026-01-15", undefined);
    expect(result.toISOString()).toBe("2026-01-15T22:59:59.000Z");
  });

  it("defaults to 23:59:59 Berlin (end of day) when no time is given - in summer", () => {
    const result = combineDateAndOptionalTime("2026-07-15", undefined);
    expect(result.toISOString()).toBe("2026-07-15T21:59:59.000Z");
  });
});

describe("dateKeyInTimeZone - UTC instant rolling onto the next local calendar day", () => {
  it("treats a late UTC evening as already the next day in Berlin (winter, UTC+1)", () => {
    // 23:30 UTC on Jan 15 = 00:30 Berlin on Jan 16 in winter.
    const utcLateEvening = new Date("2026-01-15T23:30:00.000Z");
    expect(dateKeyInTimeZone(utcLateEvening)).toBe("2026-01-16");
  });

  it("treats a late UTC evening as already the next day in Berlin (summer, UTC+2)", () => {
    // 22:30 UTC on Jul 15 = 00:30 Berlin on Jul 16 in summer.
    const utcLateEvening = new Date("2026-07-15T22:30:00.000Z");
    expect(dateKeyInTimeZone(utcLateEvening)).toBe("2026-07-16");
  });

  it("does NOT roll over for a UTC morning instant", () => {
    const utcMorning = new Date("2026-01-15T08:00:00.000Z");
    expect(dateKeyInTimeZone(utcMorning)).toBe("2026-01-15");
  });
});

describe("isSameDayInTimeZone", () => {
  it("considers 'yesterday' and 'today' different days", () => {
    const today = new Date("2026-06-15T10:00:00.000Z");
    const yesterday = new Date("2026-06-14T10:00:00.000Z");
    expect(isSameDayInTimeZone(today, yesterday)).toBe(false);
  });

  it("considers 'tomorrow' and 'today' different days", () => {
    const today = new Date("2026-06-15T10:00:00.000Z");
    const tomorrow = new Date("2026-06-16T10:00:00.000Z");
    expect(isSameDayInTimeZone(today, tomorrow)).toBe(false);
  });

  it("correctly matches two UTC instants that fall on the same Berlin day despite crossing UTC midnight", () => {
    // 23:00 UTC on Jun 14 = 01:00 Berlin on Jun 15 (summer, UTC+2).
    // 20:00 UTC on Jun 15 = 22:00 Berlin on Jun 15.
    const lateJune14Utc = new Date("2026-06-14T23:00:00.000Z");
    const eveningJune15Utc = new Date("2026-06-15T20:00:00.000Z");
    expect(isSameDayInTimeZone(lateJune14Utc, eveningJune15Utc)).toBe(true);
  });

  it("matches around the DST transition in late March without being off by a day", () => {
    // Deutlich vor und nach dem Übergang, nicht die exakte Umstellungsstunde
    // selbst - prüft, dass isSameDayInTimeZone auch über den Wechsel hinweg
    // konsistent bleibt, ohne sich auf das exakte Umstellungsdatum zu verlassen.
    const earlyMorning = new Date("2026-03-29T05:00:00.000Z");
    const lateEvening = new Date("2026-03-29T21:00:00.000Z");
    expect(isSameDayInTimeZone(earlyMorning, lateEvening)).toBe(true);
  });
});
