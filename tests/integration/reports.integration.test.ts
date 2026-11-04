import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveReportPeriod } from "@/modules/reports/period";
import { getReport, listExportRows } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/validations/report";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));

// Freitag, 15.05.2026 12:00 Berlin. "30d" = 2026-04-16 .. 2026-05-15.
const NOW = new Date("2026-05-15T10:00:00Z");
const period = resolveReportPeriod({ period: "30d" }, NOW);
const none = reportFiltersSchema.parse({});

let numberCounter = 0;
let userA: { id: string };
let userB: { id: string };
let company: { id: string };

const d = (value: string) => new Date(value);

async function seed() {
  const mkUser = (firstName: string) =>
    prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName,
        lastName: "Report",
      },
    });
  userA = await mkUser("Anna");
  userB = await mkUser("Ben");
  company = await prisma.company.create({ data: { id: createId(), name: "Report GmbH" } });

  // --- Deals (Erwartung alle Benutzer: neu 4, offen 2/150.000, gewonnen 1/300.000,
  // verloren 1/150.000, Ø 150.000 Cent; D4 außerhalb, D5 soft-deleted).
  const deal = (
    status: "OPEN" | "WON" | "LOST",
    valueCents: number,
    createdAt: string,
    closedAt: string | null,
    extra: { userId?: string; deleted?: boolean } = {},
  ) =>
    prisma.deal.create({
      data: {
        id: createId(),
        name: `Deal ${createId()}`,
        companyId: company.id,
        service: "WEBSITE",
        status,
        valueCents,
        createdAt: d(createdAt),
        closedAt: closedAt ? d(closedAt) : null,
        assignedUserId: extra.userId ?? userA.id,
        deletedAt: extra.deleted ? new Date() : null,
      },
    });
  await deal("OPEN", 100000, "2026-05-10T10:00:00Z", null);
  await deal("WON", 300000, "2026-05-01T10:00:00Z", "2026-05-12T10:00:00Z");
  await deal("LOST", 150000, "2026-05-02T10:00:00Z", "2026-05-13T10:00:00Z");
  await deal("WON", 200000, "2026-03-01T10:00:00Z", "2026-03-05T10:00:00Z");
  await deal("WON", 999900, "2026-05-01T10:00:00Z", "2026-05-12T10:00:00Z", { deleted: true });
  await deal("OPEN", 50000, "2026-05-11T10:00:00Z", null, { userId: userB.id });

  // --- Rechnungen (Erwartung: im Zeitraum ausgestellt 5; fakturiert 3 / 202.300;
  // bezahlt im Zeitraum 2 / 154.700; offen 2 / 83.300; überfällig 1 / 59.500).
  const invoice = (
    status: "DRAFT" | "SENT" | "PAID" | "CANCELLED",
    totalCents: number,
    issue: string,
    due: string,
    extra: { paidAt?: string; deleted?: boolean } = {},
  ) =>
    prisma.invoice.create({
      data: {
        id: createId(),
        invoiceNumber: `RE-2026-${String(++numberCounter).padStart(4, "0")}`,
        status,
        companyId: company.id,
        assignedUserId: userA.id,
        createdById: userA.id,
        issueDate: d(`${issue}T00:00:00Z`),
        dueDate: d(`${due}T00:00:00Z`),
        currency: "EUR",
        subtotalCents: totalCents,
        taxCents: 0,
        totalCents,
        issuerName: "RDEvolution",
        issuerSnapshot: {},
        recipientName: "Report GmbH",
        recipientAddress: "Teststr. 1",
        paidAt: extra.paidAt ? d(extra.paidAt) : null,
        deletedAt: extra.deleted ? new Date() : null,
      },
    });
  await invoice("PAID", 119000, "2026-05-02", "2026-05-16", { paidAt: "2026-05-10T08:00:00Z" });
  await invoice("SENT", 59500, "2026-05-03", "2026-05-10");
  await invoice("SENT", 23800, "2026-05-04", "2026-06-01");
  await invoice("CANCELLED", 11900, "2026-05-05", "2026-06-05");
  await invoice("DRAFT", 5950, "2026-05-06", "2026-06-06");
  await invoice("DRAFT", 99999, "2026-05-07", "2026-05-08", { deleted: true });
  await invoice("PAID", 35700, "2026-03-01", "2026-03-15", { paidAt: "2026-05-12T10:00:00Z" });

  // --- Angebote (Erwartung: erstellt 6; Wert ohne storniert 270.000; angenommen
  // 100.000; offen/versendet-gültig 70.000; abgelaufen 1 / 30.000; Conversion 50 %).
  const quote = (
    status: "DRAFT" | "READY" | "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED",
    totalCents: number,
    issue: string,
    validUntil: string,
    deleted = false,
  ) =>
    prisma.quote.create({
      data: {
        id: createId(),
        quoteNumber: `ANG-2026-${String(++numberCounter).padStart(4, "0")}`,
        status,
        companyId: company.id,
        assignedUserId: userA.id,
        createdById: userA.id,
        issueDate: d(`${issue}T00:00:00Z`),
        validUntil: d(`${validUntil}T00:00:00Z`),
        currency: "EUR",
        subtotalCents: totalCents,
        taxCents: 0,
        totalCents,
        issuerName: "RDEvolution",
        recipientName: "Report GmbH",
        recipientAddress: "Teststr. 1",
        deletedAt: deleted ? new Date() : null,
      },
    });
  await quote("ACCEPTED", 100000, "2026-05-02", "2026-06-01");
  await quote("REJECTED", 50000, "2026-05-03", "2026-06-01");
  await quote("SENT", 70000, "2026-05-04", "2026-06-15");
  await quote("SENT", 30000, "2026-04-20", "2026-05-01");
  await quote("READY", 20000, "2026-05-05", "2026-06-15");
  await quote("CANCELLED", 10000, "2026-05-05", "2026-06-15");
  await quote("DRAFT", 99999, "2026-05-05", "2026-06-15", true);

  // --- Aufgaben (offen 2, überfällig 1, erledigt im Zeitraum 1).
  const task = (
    status: "OPEN" | "IN_PROGRESS" | "COMPLETED",
    dueAt: string,
    completedAt: string | null,
    deleted = false,
  ) =>
    prisma.task.create({
      data: {
        id: createId(),
        title: `Task ${createId()}`,
        status,
        dueAt: d(dueAt),
        completedAt: completedAt ? d(completedAt) : null,
        assignedUserId: userA.id,
        createdById: userA.id,
        deletedAt: deleted ? new Date() : null,
      },
    });
  await task("OPEN", "2026-05-10T10:00:00Z", null);
  await task("IN_PROGRESS", "2026-06-01T10:00:00Z", null);
  await task("COMPLETED", "2026-05-11T10:00:00Z", "2026-05-12T10:00:00Z");
  await task("OPEN", "2026-05-01T10:00:00Z", null, true);

  // --- Leads (neu 2, offen 2, Funnel 1/1, Follow-ups überfällig 1 / heute 1).
  const pipeline = await prisma.pipeline.create({
    data: {
      id: createId(),
      name: "Report-Pipeline",
      isDefault: true,
      stages: {
        create: [
          { id: createId(), name: "Stufe A", position: 1 },
          { id: createId(), name: "Stufe B", position: 2 },
        ],
      },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  const lead = (
    stage: number,
    status: "OPEN" | "WON",
    createdAt: string,
    followUp: string | null,
    deleted = false,
  ) =>
    prisma.lead.create({
      data: {
        id: createId(),
        title: `Lead ${createId()}`,
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[stage].id,
        status,
        createdAt: d(createdAt),
        nextFollowUpAt: followUp ? d(followUp) : null,
        assignedUserId: userA.id,
        deletedAt: deleted ? new Date() : null,
      },
    });
  await lead(0, "OPEN", "2026-05-10T10:00:00Z", "2026-05-10T10:00:00Z");
  await lead(1, "OPEN", "2026-05-11T10:00:00Z", "2026-05-15T08:00:00Z");
  await lead(1, "WON", "2026-03-01T10:00:00Z", null);
  await lead(0, "OPEN", "2026-05-11T10:00:00Z", null, true);

  // --- Aktivitäten (im Zeitraum 4: A 3, B 1; eine außerhalb).
  const activity = (
    type: "DEAL_CREATED" | "DEAL_WON" | "TASK_CREATED" | "INVOICE_PAID",
    user: string,
    at: string,
  ) => prisma.activity.create({ data: { id: createId(), type, userId: user, createdAt: d(at) } });
  await activity("DEAL_CREATED", userA.id, "2026-05-10T10:00:00Z");
  await activity("DEAL_WON", userA.id, "2026-05-12T10:00:00Z");
  await activity("TASK_CREATED", userA.id, "2026-05-12T11:00:00Z");
  await activity("INVOICE_PAID", userB.id, "2026-05-12T12:00:00Z");
  await activity("DEAL_CREATED", userA.id, "2026-02-01T10:00:00Z");
}

beforeEach(seed);

describe("reports aggregations against real data", () => {
  it("computes deal KPIs and excludes soft-deleted/out-of-range deals", async () => {
    const { deals } = await getReport(period, none, NOW);
    expect(deals.newDeals).toBe(4);
    expect(deals.open).toEqual({ count: 2, cents: 150000 });
    expect(deals.won).toEqual({ count: 1, cents: 300000 });
    expect(deals.lost).toEqual({ count: 1, cents: 150000 });
    expect(deals.averageCents).toBe(150000);
    expect(deals.wonList).toHaveLength(1);
  });

  it("filters by user where a real relation exists", async () => {
    const { deals, activities, tasks } = await getReport(
      period,
      reportFiltersSchema.parse({ userId: userB.id }),
      NOW,
    );
    expect(deals.newDeals).toBe(1);
    expect(deals.open).toEqual({ count: 1, cents: 50000 });
    expect(deals.won.count).toBe(0);
    expect(activities.total).toBe(1);
    expect(tasks.open).toBe(0);
  });

  it("computes quote KPIs incl. derived EXPIRED, CANCELLED and conversion", async () => {
    const { quotes } = await getReport(period, none, NOW);
    expect(quotes.summary.created.count).toBe(6);
    expect(quotes.summary.valueCreatedCents).toBe(270000);
    expect(quotes.summary.acceptedCents).toBe(100000);
    expect(quotes.summary.openSentCents).toBe(70000);
    expect(quotes.byStatus.EXPIRED).toEqual({ count: 1, cents: 30000 });
    expect(quotes.byStatus.CANCELLED.count).toBe(1);
    expect(quotes.summary.conversionRate).toBe(50);
    expect(quotes.openList).toHaveLength(2); // SENT gültig + READY gültig
  });

  it("computes invoice KPIs: cancelled/draft/deleted are not revenue", async () => {
    const { invoices } = await getReport(period, none, NOW);
    expect(invoices.summary.issued.count).toBe(5);
    expect(invoices.byStatus.PAID).toEqual({ count: 1, cents: 119000 });
    expect(invoices.byStatus.OVERDUE).toEqual({ count: 1, cents: 59500 });
    expect(invoices.byStatus.SENT).toEqual({ count: 1, cents: 23800 });
    expect(invoices.summary.invoiced).toEqual({ count: 3, cents: 202300 });
    expect(invoices.paid).toEqual({ count: 2, cents: 154700 });
    expect(invoices.open).toEqual({ count: 2, cents: 83300 });
    expect(invoices.overdue).toEqual({ count: 1, cents: 59500 });
    expect(invoices.overdueList).toHaveLength(1);
  });

  it("builds the revenue trend server-side (Berlin days) matching the KPIs", async () => {
    const { trend } = await getReport(period, none, NOW);
    expect(trend.invoiced).toHaveLength(30);
    expect(trend.invoiced.reduce((s, p) => s + p.value, 0)).toBe(202300);
    expect(trend.invoiced.find((p) => p.key === "2026-05-02")?.value).toBe(119000);
    expect(trend.paid.reduce((s, p) => s + p.value, 0)).toBe(154700);
    expect(trend.paid.find((p) => p.key === "2026-05-10")?.value).toBe(119000);
    expect(trend.paid.find((p) => p.key === "2026-05-12")?.value).toBe(35700);
    expect(trend.activities.reduce((s, p) => s + p.value, 0)).toBe(4);
  });

  it("groups the trend by month for a yearly period", async () => {
    const year = resolveReportPeriod({ period: "year" }, NOW);
    const { trend } = await getReport(year, none, NOW);
    expect(trend.invoiced.map((p) => p.key)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
    // I1+I2+I3 im Mai (202.300) + I7 (bezahlt, März) zählt als fakturiert im März.
    expect(trend.invoiced.find((p) => p.key === "2026-05-01")?.value).toBe(202300);
    expect(trend.invoiced.find((p) => p.key === "2026-03-01")?.value).toBe(35700);
  });

  it("computes task, follow-up and lead KPIs with real pipeline stages", async () => {
    const { tasks, leads } = await getReport(period, none, NOW);
    expect(tasks).toMatchObject({ open: 2, overdue: 1, completed: 1 });
    expect(leads.newLeads).toBe(2);
    expect(leads.openLeads).toBe(2);
    expect(leads.funnel).toEqual([
      expect.objectContaining({ label: "Stufe A", value: 1 }),
      expect.objectContaining({ label: "Stufe B", value: 1 }),
    ]);
    expect(leads.followUps).toEqual({ overdue: 1, today: 1 });
  });

  it("computes activity KPIs via the central categories", async () => {
    const { activities } = await getReport(period, none, NOW);
    expect(activities.total).toBe(4);
    expect(activities.byCategory).toEqual([
      { category: "SALES", count: 2 },
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 1 }),
    ]);
    expect(activities.byUser[0]).toMatchObject({ label: "Anna Report", value: 3 });
  });

  it("respects date boundaries (Berlin day edges)", async () => {
    // Deal closed 2026-05-12T21:59Z = 23:59 Berlin on the 12th; one minute later = the 13th.
    await prisma.deal.create({
      data: {
        id: createId(),
        name: "Grenze",
        companyId: company.id,
        service: "WEBSITE",
        status: "WON",
        valueCents: 1000,
        closedAt: d("2026-05-12T21:59:59Z"),
        assignedUserId: userA.id,
      },
    });
    const on12 = resolveReportPeriod(
      { period: "custom", from: "2026-05-12", to: "2026-05-12" },
      NOW,
    );
    const on13 = resolveReportPeriod(
      { period: "custom", from: "2026-05-13", to: "2026-05-13" },
      NOW,
    );
    expect((await getReport(on12, none, NOW)).deals.won.count).toBe(2);
    expect((await getReport(on13, none, NOW)).deals.won.count).toBe(0);
  });

  it("returns zeros for an empty period without failing", async () => {
    const empty = resolveReportPeriod(
      { period: "custom", from: "2020-01-01", to: "2020-01-31" },
      NOW,
    );
    const report = await getReport(empty, none, NOW);
    expect(report.deals.won.count).toBe(0);
    expect(report.invoices.summary.invoiced.cents).toBe(0);
    expect(report.activities.total).toBe(0);
    expect(report.trend.invoiced.every((p) => p.value === 0)).toBe(true);
  });

  it("lists export rows per type for the period (limited, no deleted rows)", async () => {
    expect(await listExportRows("invoices", period, none)).toHaveLength(5);
    expect(await listExportRows("quotes", period, none)).toHaveLength(6);
    expect(await listExportRows("deals", period, none)).toHaveLength(4);
  });
});

describe("reports access", () => {
  it("blocks unauthenticated and deactivated users", async () => {
    const { getCurrentUser } = await import("@/server/rbac");
    authMock.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    authMock.mockResolvedValue({ user: { id: userA.id, authVersion: row.authVersion } });
    expect((await getCurrentUser())?.id).toBe(userA.id);
    await prisma.user.update({ where: { id: userA.id }, data: { isActive: false } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("CSV export route: 401 without session, sanitised CSV with session", async () => {
    const { GET } = await import("@/app/(dashboard)/reports/export/[type]/route");
    authMock.mockResolvedValue(null);
    const denied = await GET(new Request("http://x/reports/export/deals"), {
      params: Promise.resolve({ type: "deals" }),
    });
    expect(denied.status).toBe(401);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    authMock.mockResolvedValue({ user: { id: userA.id, authVersion: row.authVersion } });
    await prisma.deal.updateMany({
      where: { status: "OPEN", valueCents: 100000 },
      data: { name: "=cmd|calc" },
    });
    const ok = await GET(
      new Request("http://x/reports/export/deals?period=custom&from=2026-05-01&to=2026-05-31"),
      { params: Promise.resolve({ type: "deals" }) },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/csv");
    const bytes = new Uint8Array(await ok.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const body = new TextDecoder().decode(bytes);
    expect(body).toContain("Deal;Unternehmen;Status;Wert (EUR)");
    expect(body).toContain("'=cmd|calc;Report GmbH;Offen;1000,00;2026-05-10;");
    expect(body.trim().split(String.fromCharCode(13, 10))).toHaveLength(1 + 4); // Kopf + 4 Deals
    const bad = await GET(new Request("http://x/reports/export/users"), {
      params: Promise.resolve({ type: "users" }),
    });
    expect(bad.status).toBe(404);
  });
});
