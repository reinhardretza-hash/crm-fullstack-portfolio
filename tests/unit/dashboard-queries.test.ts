import { beforeEach, describe, expect, it, vi } from "vitest";

// Aktive Leads/Pipeline-Wert seit Phase 3, Offene Deals/Deal-Wert/
// Gewonnen/Verloren seit Phase 4, Aufgaben heute/überfällig/offen seit
// Phase 5 sind echte Aggregationen - dieser Unit-Test mockt Prisma
// vollständig (keine echte Datenbank nötig) und prüft nur, dass bei leeren
// Tabellen ehrliche Nullwerte/leere Listen herauskommen, nie erfundene
// Platzhalterzahlen.

const leadCountMock = vi.fn();
const leadAggregateMock = vi.fn();
const dealCountMock = vi.fn();
const dealAggregateMock = vi.fn();
const taskCountMock = vi.fn();
const activityFindManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      count: (...args: unknown[]) => leadCountMock(...args),
      aggregate: (...args: unknown[]) => leadAggregateMock(...args),
    },
    deal: {
      count: (...args: unknown[]) => dealCountMock(...args),
      aggregate: (...args: unknown[]) => dealAggregateMock(...args),
    },
    task: {
      count: (...args: unknown[]) => taskCountMock(...args),
    },
    activity: { findMany: (...args: unknown[]) => activityFindManyMock(...args) },
  },
}));

const { getDashboardKpis, getRecentActivities } = await import("@/modules/dashboard/queries");

beforeEach(() => {
  leadCountMock.mockReset().mockResolvedValue(0);
  leadAggregateMock.mockReset().mockResolvedValue({ _sum: { expectedValueCents: null } });
  dealCountMock.mockReset().mockResolvedValue(0);
  dealAggregateMock.mockReset().mockResolvedValue({ _sum: { valueCents: null } });
  taskCountMock.mockReset().mockResolvedValue(0);
  activityFindManyMock.mockReset().mockResolvedValue([]);
});

describe("getDashboardKpis", () => {
  it("returns only real zero values when there is no data, no invented numbers", async () => {
    await expect(getDashboardKpis()).resolves.toEqual({
      activeLeads: 0,
      openDeals: 0,
      openDealsValueEuro: 0,
      wonDeals: 0,
      lostDeals: 0,
      openTasks: 0,
      tasksToday: 0,
      overdueTasks: 0,
      pipelineValueEuro: 0,
    });
  });

  it("reflects real lead aggregation when data exists", async () => {
    leadCountMock.mockResolvedValueOnce(3);
    leadAggregateMock.mockResolvedValueOnce({ _sum: { expectedValueCents: 1_500_000 } });

    const kpis = await getDashboardKpis();

    expect(kpis.activeLeads).toBe(3);
    expect(kpis.pipelineValueEuro).toBe(15000);
  });

  it("reflects real deal aggregation when data exists, kept separate from the lead pipeline value", async () => {
    dealCountMock.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    dealAggregateMock.mockResolvedValueOnce({ _sum: { valueCents: 800_000 } });

    const kpis = await getDashboardKpis();

    expect(kpis.openDeals).toBe(2);
    expect(kpis.openDealsValueEuro).toBe(8000);
    expect(kpis.wonDeals).toBe(1);
    expect(kpis.lostDeals).toBe(1);
    // Pipeline-Wert (Lead) bleibt unverändert 0 - keine Vermischung der
    // beiden Kennzahlen.
    expect(kpis.pipelineValueEuro).toBe(0);
  });

  it("reflects real task aggregation when data exists (offen/heute/überfällig)", async () => {
    taskCountMock.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

    const kpis = await getDashboardKpis();

    expect(kpis.openTasks).toBe(5);
    expect(kpis.tasksToday).toBe(2);
    expect(kpis.overdueTasks).toBe(1);
  });
});

describe("getRecentActivities", () => {
  it("returns an empty list when there are no activities", async () => {
    await expect(getRecentActivities()).resolves.toEqual([]);
  });

  it("describes a real activity row, including its related entity name", async () => {
    activityFindManyMock.mockResolvedValueOnce([
      {
        id: "activity-1",
        type: "LEAD_CREATED",
        createdAt: new Date("2026-06-15T12:00:00Z"),
        company: null,
        contact: null,
        lead: { title: "Digitalisierung interner Prozesse" },
        deal: null,
        task: null,
      },
    ]);

    const activities = await getRecentActivities();

    expect(activities).toEqual([
      {
        id: "activity-1",
        description: "Lead erstellt – Digitalisierung interner Prozesse",
        occurredAt: new Date("2026-06-15T12:00:00Z"),
      },
    ]);
  });

  it("describes a Deal activity row by the deal name, when no company/contact/lead applies", async () => {
    activityFindManyMock.mockResolvedValueOnce([
      {
        id: "activity-2",
        type: "DEAL_WON",
        createdAt: new Date("2026-06-16T09:00:00Z"),
        company: null,
        contact: null,
        lead: null,
        deal: { name: "Website-Relaunch" },
        task: null,
      },
    ]);

    const activities = await getRecentActivities();

    expect(activities).toEqual([
      {
        id: "activity-2",
        description: "Deal gewonnen – Website-Relaunch",
        occurredAt: new Date("2026-06-16T09:00:00Z"),
      },
    ]);
  });

  it("describes a Task activity row by the task title, when no other entity applies", async () => {
    activityFindManyMock.mockResolvedValueOnce([
      {
        id: "activity-3",
        type: "TASK_COMPLETED",
        createdAt: new Date("2026-06-17T09:00:00Z"),
        company: null,
        contact: null,
        lead: null,
        deal: null,
        task: { title: "Angebot nachfassen" },
      },
    ]);

    const activities = await getRecentActivities();

    expect(activities).toEqual([
      {
        id: "activity-3",
        description: "Aufgabe erledigt – Angebot nachfassen",
        occurredAt: new Date("2026-06-17T09:00:00Z"),
      },
    ]);
  });
});
