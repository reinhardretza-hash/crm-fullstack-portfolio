import { describe, expect, it } from "vitest";
import { formatCentsAsEuro } from "@/lib/money";
import {
  activitiesByCategory,
  applyInvoiceOverdue,
  applyQuoteExpiry,
  averageCents,
  conversionRate,
  emptyStatusMap,
  invoiceSummary,
  quoteSummary,
} from "@/modules/reports/kpi";
import { centsToCsvAmount, sanitizeCsvCell, toCsv } from "@/modules/reports/csv";
import { buildExportCsv } from "@/modules/reports/export";
import {
  bucketKeyOf,
  bucketKeys,
  fillBuckets,
  granularityForDays,
  resolveReportPeriod,
} from "@/modules/reports/period";
import { buildActivityWhere } from "@/modules/activity/queries";
import { INVOICE_STATUSES } from "@/modules/invoices/helpers";
import { QUOTE_STATUSES } from "@/modules/quotes/helpers";
import { activityFiltersSchema } from "@/validations/activity";
import { pluralize } from "@/modules/reports/text";
import { reportFiltersSchema } from "@/validations/report";

// Freitag, 15.05.2026 12:00 Europe/Berlin (10:00 UTC).
const NOW = new Date("2026-05-15T10:00:00Z");

describe("report period presets (Europe/Berlin)", () => {
  it("resolves the presets relative to the Berlin calendar day", () => {
    const range = (period: string) => {
      const p = resolveReportPeriod({ period }, NOW);
      return [p.fromKey, p.toKey, p.granularity];
    };
    expect(range("today")).toEqual(["2026-05-15", "2026-05-15", "day"]);
    expect(range("7d")).toEqual(["2026-05-09", "2026-05-15", "day"]);
    expect(range("30d")).toEqual(["2026-04-16", "2026-05-15", "day"]);
    expect(range("quarter")).toEqual(["2026-04-01", "2026-05-15", "week"]);
    expect(range("year")).toEqual(["2026-01-01", "2026-05-15", "month"]);
  });

  it("uses the Berlin day, not the UTC day, around midnight", () => {
    // 22:30 UTC = 00:30 Berlin (CEST) on the 15th.
    const p = resolveReportPeriod({ period: "today" }, new Date("2026-05-14T22:30:00Z"));
    expect(p.fromKey).toBe("2026-05-15");
    expect(p.start.toISOString()).toBe("2026-05-14T22:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-05-15T21:59:59.999Z");
  });

  it("handles the DST switch inside a custom range", () => {
    const p = resolveReportPeriod({ period: "custom", from: "2026-03-28", to: "2026-03-29" }, NOW);
    expect(p.start.toISOString()).toBe("2026-03-27T23:00:00.000Z"); // CET
    expect(p.end.toISOString()).toBe("2026-03-29T21:59:59.999Z"); // CEST
  });

  it("falls back to the default for invalid input", () => {
    for (const raw of [
      { period: "bogus" },
      { period: "custom" },
      { period: "custom", from: "2026-02-30", to: "2026-03-01" },
      { period: "custom", from: "2026-05-10", to: "2026-05-01" },
      { period: "custom", from: "1900-01-01", to: "2026-05-01" },
      { period: "custom", from: "x", to: "y" },
    ]) {
      const p = resolveReportPeriod(raw, NOW);
      expect(p.preset).toBe("30d");
      expect(p.fellBack).toBe(true);
    }
    expect(resolveReportPeriod({}, NOW).fellBack).toBe(false);
  });

  it("picks the granularity by range length", () => {
    expect(granularityForDays(1)).toBe("day");
    expect(granularityForDays(31)).toBe("day");
    expect(granularityForDays(32)).toBe("week");
    expect(granularityForDays(120)).toBe("week");
    expect(granularityForDays(121)).toBe("month");
  });
});

describe("report bucket grouping", () => {
  it("maps dates to day/week(Monday)/month buckets", () => {
    expect(bucketKeyOf("2026-05-15", "day")).toBe("2026-05-15");
    expect(bucketKeyOf("2026-05-15", "week")).toBe("2026-05-11");
    expect(bucketKeyOf("2026-05-17", "week")).toBe("2026-05-11"); // Sonntag
    expect(bucketKeyOf("2026-05-18", "week")).toBe("2026-05-18");
    expect(bucketKeyOf("2026-05-15", "month")).toBe("2026-05-01");
  });

  it("lists all buckets and zero-fills missing ones", () => {
    const week = { fromKey: "2026-04-01", toKey: "2026-04-20", granularity: "week" as const };
    expect(bucketKeys(week)).toEqual(["2026-03-30", "2026-04-06", "2026-04-13", "2026-04-20"]);
    const month = { fromKey: "2025-11-15", toKey: "2026-02-01", granularity: "month" as const };
    expect(bucketKeys(month)).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
    const filled = fillBuckets(week, [{ bucket: "2026-04-06", value: 500 }]);
    expect(filled.map((b) => b.value)).toEqual([0, 500, 0, 0]);
  });
});

describe("report KPI helpers", () => {
  it("computes the quote conversion only from decided quotes", () => {
    expect(conversionRate(1, 3)).toBe(25);
    expect(conversionRate(2, 1)).toBe(66.7);
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(0, 2)).toBe(0);
  });

  it("evaluates quote statuses incl. derived EXPIRED and excludes cancelled from value", () => {
    const map = emptyStatusMap(QUOTE_STATUSES);
    map.DRAFT = { count: 1, cents: 1000 };
    map.SENT = { count: 3, cents: 9000 };
    map.ACCEPTED = { count: 1, cents: 5000 };
    map.REJECTED = { count: 1, cents: 2000 };
    map.CANCELLED = { count: 1, cents: 7000 };
    const shifted = applyQuoteExpiry(map, { SENT: { count: 1, cents: 4000 } });
    expect(shifted.SENT).toEqual({ count: 2, cents: 5000 });
    expect(shifted.EXPIRED).toEqual({ count: 1, cents: 4000 });
    const summary = quoteSummary(shifted);
    expect(summary.created.count).toBe(7);
    expect(summary.valueCreatedCents).toBe(1000 + 5000 + 4000 + 5000 + 2000);
    expect(summary.acceptedCents).toBe(5000);
    expect(summary.openSentCents).toBe(5000);
    expect(summary.conversionRate).toBe(50);
  });

  it("evaluates invoice statuses: only SENT/PAID/OVERDUE count as invoiced", () => {
    const map = emptyStatusMap(INVOICE_STATUSES);
    map.DRAFT = { count: 1, cents: 100 };
    map.SENT = { count: 2, cents: 2000 };
    map.PAID = { count: 1, cents: 3000 };
    map.CANCELLED = { count: 1, cents: 9999 };
    const shifted = applyInvoiceOverdue(map, { SENT: { count: 1, cents: 500 } });
    expect(shifted.OVERDUE).toEqual({ count: 1, cents: 500 });
    expect(shifted.SENT).toEqual({ count: 1, cents: 1500 });
    const summary = invoiceSummary(shifted);
    expect(summary.invoiced).toEqual({ count: 3, cents: 5000 });
    expect(summary.issued.count).toBe(5);
  });

  it("averages deal values in integer cents", () => {
    expect(averageCents({ count: 0, cents: 0 })).toBe(0);
    expect(averageCents({ count: 3, cents: 1000 })).toBe(333);
    expect(averageCents({ count: 2, cents: 301 })).toBe(151);
  });

  it("formats money as EUR de-DE from integer cents", () => {
    expect(formatCentsAsEuro(300000).replace(/\s/g, " ")).toBe("3.000,00 €");
    expect(formatCentsAsEuro(5).replace(/\s/g, " ")).toBe("0,05 €");
  });

  it("groups activities by the central Phase 12 categories", () => {
    expect(
      activitiesByCategory([
        { type: "DEAL_CREATED", count: 2 },
        { type: "LEAD_WON", count: 1 },
        { type: "TASK_CREATED", count: 5 },
      ]),
    ).toEqual([
      { category: "TASKS", count: 5 },
      { category: "SALES", count: 3 },
    ]);
  });

  it("validates report filters (ids only)", () => {
    expect(reportFiltersSchema.parse({ userId: " ", pipelineId: "p1" })).toEqual({
      userId: undefined,
      pipelineId: "p1",
    });
  });

  it("keeps the soft-delete rule: history queries do not filter, report sections do", () => {
    expect(JSON.stringify(buildActivityWhere(activityFiltersSchema.parse({})))).not.toContain(
      "deletedAt",
    );
  });
});

describe("CSV export", () => {
  it("neutralises formula injection and escapes", () => {
    expect(sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(sanitizeCsvCell("+49 123")).toBe("'+49 123");
    expect(sanitizeCsvCell("-5")).toBe("'-5");
    expect(sanitizeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(sanitizeCsvCell("\tx")).toBe("'\tx");
    expect(sanitizeCsvCell('Firma "A"; B')).toBe('"Firma ""A""; B"');
    expect(sanitizeCsvCell("zeile\nzwei")).toBe('"zeile\nzwei"');
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(12)).toBe("12");
  });

  it("formats cents without floats and builds UTF-8 CSV with BOM", () => {
    expect(centsToCsvAmount(150000)).toBe("1500,00");
    expect(centsToCsvAmount(5)).toBe("0,05");
    const csv = toCsv(["A", "B"], [["ä", "=x"]]);
    expect(csv.startsWith("﻿A;B\r\n")).toBe(true);
    expect(csv).toContain("ä;'=x");
  });

  it("exports deals with labels, euro amounts and Berlin dates", () => {
    const csv = buildExportCsv("deals", [
      {
        name: "=Deal",
        status: "WON",
        valueCents: 300000,
        createdAt: new Date("2026-05-14T22:30:00Z"),
        closedAt: null,
        company: { name: "Acme" },
      },
    ]);
    expect(csv).toContain("'=Deal;Acme;Gewonnen;3000,00;2026-05-15;");
  });
});

describe("pluralize (report count texts)", () => {
  it("handles 0, 1 and 2", () => {
    const text = (n: number) => pluralize(n, "überfällige Rechnung", "überfällige Rechnungen");
    expect(text(0)).toBe("0 überfällige Rechnungen");
    expect(text(1)).toBe("1 überfällige Rechnung");
    expect(text(2)).toBe("2 überfällige Rechnungen");
    expect(pluralize(1, "offener Deal", "offene Deals")).toBe("1 offener Deal");
    expect(pluralize(2, "offener Deal", "offene Deals")).toBe("2 offene Deals");
    expect(pluralize(1, "offene Aufgabe", "offene Aufgaben")).toBe("1 offene Aufgabe");
    expect(pluralize(1, "angenommenes Angebot", "angenommene Angebote")).toBe(
      "1 angenommenes Angebot",
    );
  });
});
