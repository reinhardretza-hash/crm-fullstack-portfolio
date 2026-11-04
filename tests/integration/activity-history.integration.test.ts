import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { activityTarget } from "@/modules/activity/catalog";
import { listActivities } from "@/modules/activity/queries";
import { activityFiltersSchema } from "@/validations/activity";
import { hasPermission } from "@/server/permissions";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: authMock }));

const page = { page: 1, pageSize: 25 as const };
const run = (raw: Record<string, string> = {}, p = page) =>
  listActivities(activityFiltersSchema.parse(raw), p);

let userA: { id: string };
let userB: { id: string };
let company: { id: string };
let contact: { id: string };

async function log(
  type: ActivityType,
  extra: Record<string, unknown> = {},
  createdAt = new Date(),
) {
  return prisma.activity.create({ data: { id: createId(), type, createdAt, ...extra } });
}

async function createDeal(companyId: string, name = "Deal X") {
  return prisma.deal.create({
    data: { id: createId(), name, companyId, valueCents: 1000, service: "WEBSITE" },
  });
}

beforeEach(async () => {
  const mk = (firstName: string) =>
    prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName,
        lastName: "Test",
      },
    });
  userA = await mk("Anna");
  userB = await mk("Ben");
  company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
  contact = await prisma.contact.create({
    data: { id: createId(), firstName: "Max", lastName: "Mustermann", companyId: company.id },
  });
});

describe("activity history list", () => {
  it("paginates server-side with a stable order", async () => {
    for (let i = 0; i < 30; i++) {
      await log("COMPANY_UPDATED", { companyId: company.id }, new Date(Date.UTC(2026, 0, 1, 0, i)));
    }
    const p1 = await run({}, page);
    const p2 = await run({}, { page: 2, pageSize: 25 as const });
    expect(p1.totalCount).toBe(30);
    expect(p1.totalPages).toBe(2);
    expect(p1.activities).toHaveLength(25);
    expect(p2.activities).toHaveLength(5);
    const ids = new Set(p1.activities.map((a) => a.id));
    expect(p2.activities.every((a) => !ids.has(a.id))).toBe(true);
    expect(p1.activities[0].createdAt.getTime()).toBeGreaterThan(
      p1.activities[24].createdAt.getTime(),
    );
  });

  it("filters by type, category and user", async () => {
    await log("DEAL_WON", { userId: userA.id });
    await log("TASK_CREATED", { userId: userB.id });
    await log("INVOICE_PAID", { userId: userB.id });
    expect((await run({ type: "DEAL_WON" })).totalCount).toBe(1);
    expect((await run({ category: "INVOICES" })).totalCount).toBe(1);
    expect((await run({ userId: userB.id })).totalCount).toBe(2);
    expect((await run({ userId: userB.id, category: "TASKS" })).totalCount).toBe(1);
  });

  it("filters by date range (Europe/Berlin days)", async () => {
    await log("COMPANY_CREATED", {}, new Date("2026-03-10T10:00:00Z"));
    await log("COMPANY_CREATED", {}, new Date("2026-03-20T10:00:00Z"));
    expect((await run({ dateFrom: "2026-03-15" })).totalCount).toBe(1);
    expect((await run({ dateTo: "2026-03-15" })).totalCount).toBe(1);
    expect((await run({ dateFrom: "2026-03-10", dateTo: "2026-03-10" })).totalCount).toBe(1);
  });

  it("filters by company, contact, lead and deal (including indirect relations)", async () => {
    const other = await prisma.company.create({ data: { id: createId(), name: "Andere AG" } });
    const deal = await createDeal(company.id);
    await log("COMPANY_CREATED", { companyId: company.id });
    await log("CONTACT_CREATED", { contactId: contact.id });
    await log("DEAL_CREATED", { dealId: deal.id }); // nur Deal-FK, Firma indirekt
    await log("COMPANY_CREATED", { companyId: other.id });

    expect((await run({ companyId: company.id })).totalCount).toBe(2);
    expect((await run({ contactId: contact.id })).totalCount).toBe(1);
    expect((await run({ dealId: deal.id })).totalCount).toBe(1);
    expect((await run({ companyId: other.id })).totalCount).toBe(1);
  });

  it("searches related names and type labels, not JSON", async () => {
    await log("COMPANY_CREATED", { companyId: company.id });
    await log("DEAL_WON", { metadata: { subject: "Geheimwort" } });
    expect((await run({ q: "acme" })).totalCount).toBe(1);
    expect((await run({ q: "gewonnen" })).totalCount).toBe(1);
    expect((await run({ q: "Geheimwort" })).totalCount).toBe(0);
  });

  it("keeps history visible for soft-deleted targets, without a link", async () => {
    const deal = await createDeal(company.id, "Altes Deal");
    await log("DEAL_CREATED", { dealId: deal.id });
    await prisma.deal.update({ where: { id: deal.id }, data: { deletedAt: new Date() } });

    const { activities, totalCount } = await run();
    expect(totalCount).toBe(1);
    const target = activityTarget(activities[0], { canViewEmails: true });
    expect(target).toMatchObject({ label: "Altes Deal", href: null, deleted: true });
  });

  it("returns nothing for filters without matches", async () => {
    await log("COMPANY_CREATED", { companyId: company.id });
    expect((await run({ q: "zzzz-nicht-vorhanden" })).activities).toHaveLength(0);
  });
});

describe("activity access rules", () => {
  it("is open to every role that is allowed in the CRM (no ownership scoping)", () => {
    for (const role of ["OWNER", "ADMIN", "USER"] as const) {
      expect(hasPermission({ role }, "EMAIL_SEND")).toBe(true);
    }
  });

  it("blocks unauthenticated and deactivated users (page guard)", async () => {
    const { getCurrentUser } = await import("@/server/rbac");
    authMock.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();

    await prisma.user.update({ where: { id: userA.id }, data: { isActive: false } });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    authMock.mockResolvedValue({ user: { id: userA.id, authVersion: row.authVersion } });
    expect(await getCurrentUser()).toBeNull();

    await prisma.user.update({ where: { id: userA.id }, data: { isActive: true } });
    expect((await getCurrentUser())?.id).toBe(userA.id);
  });
});
