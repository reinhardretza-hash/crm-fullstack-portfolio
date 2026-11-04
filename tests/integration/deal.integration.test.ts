import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

// revalidatePath() braucht einen echten Next.js-Request-Kontext - siehe
// gleiche Begründung in tests/integration/lead.integration.test.ts.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const {
  createDealAction,
  updateDealAction,
  deleteDealAction,
  markDealWonAction,
  markDealLostAction,
  reopenDealAction,
} = await import("@/modules/deals/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function seedCompany(name = `Company-${createId()}`) {
  return prisma.company.create({ data: { id: createId(), name } });
}

async function seedContact(companyId?: string) {
  return prisma.contact.create({ data: { id: createId(), firstName: "Max", companyId } });
}

async function seedLead(companyId: string | null, contactId?: string) {
  const pipeline = await prisma.pipeline.create({
    data: {
      id: createId(),
      name: "Testpipeline",
      stages: { create: [{ id: createId(), name: "Stufe 1", position: 1 }] },
    },
    include: { stages: true },
  });
  return prisma.lead.create({
    data: {
      id: createId(),
      title: `Lead-${createId()}`,
      companyId,
      contactId,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
    },
  });
}

beforeEach(async () => {
  testUser = await prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash: "irrelevant",
      firstName: "Test",
      lastName: "User",
    },
  });
});

describe("Deal creation (real PostgreSQL transaction)", () => {
  it("creates a deal with company/contact/lead and writes Activity + AuditLog", async () => {
    const company = await seedCompany();
    const contact = await seedContact(company.id);
    const lead = await seedLead(company.id, contact.id);

    try {
      await createDealAction(
        { error: null },
        formData({
          name: "Website-Relaunch",
          companyId: company.id,
          contactId: contact.id,
          leadId: lead.id,
          service: "WEBSITE",
          valueCents: "15000",
        }),
      );
    } catch {
      // redirect() wirft einen Next.js-Kontrollfluss-Fehler - erwartet.
    }

    const deal = await prisma.deal.findFirstOrThrow({ where: { name: "Website-Relaunch" } });
    expect(deal.status).toBe("OPEN");
    expect(deal.valueCents).toBe(1_500_000);
    expect(deal.companyId).toBe(company.id);
    expect(deal.contactId).toBe(contact.id);
    expect(deal.leadId).toBe(lead.id);

    const activity = await prisma.activity.findFirst({ where: { dealId: deal.id } });
    expect(activity?.type).toBe("DEAL_CREATED");
    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: deal.id, entityType: "Deal" },
    });
    expect(auditLog?.action).toBe("DEAL_CREATED");
  });

  it("rejects a deal whose company contradicts the linked lead's company", async () => {
    const leadCompany = await seedCompany("Lead-Unternehmen");
    const otherCompany = await seedCompany("Anderes Unternehmen");
    const lead = await seedLead(leadCompany.id);

    const result = await createDealAction(
      { error: null },
      formData({
        name: "Inkonsistenter Deal",
        companyId: otherCompany.id,
        leadId: lead.id,
        service: "WEBSITE",
        valueCents: "1000",
      }),
    );

    expect(result.error).toBe(
      "Das gewählte Unternehmen passt nicht zum Unternehmen des verknüpften Leads.",
    );
    const count = await prisma.deal.count({ where: { name: "Inkonsistenter Deal" } });
    expect(count).toBe(0);
  });

  it("allows a deal without any lead at all (manuelle Erstellung)", async () => {
    const company = await seedCompany();

    try {
      await createDealAction(
        { error: null },
        formData({
          name: "Manueller Deal",
          companyId: company.id,
          service: "CONSULTING",
          valueCents: "5000",
        }),
      );
    } catch {
      // redirect - erwartet.
    }

    const deal = await prisma.deal.findFirstOrThrow({ where: { name: "Manueller Deal" } });
    expect(deal.leadId).toBeNull();
  });
});

describe("Deal editing and soft delete (real PostgreSQL)", () => {
  async function createTestDeal(company: { id: string }) {
    const name = `Deal-${createId()}`;
    try {
      await createDealAction(
        { error: null },
        formData({ name, companyId: company.id, service: "WEBSITE", valueCents: "1000" }),
      );
    } catch {
      // redirect - erwartet.
    }
    return prisma.deal.findFirstOrThrow({ where: { name } });
  }

  it("updates a deal and keeps company/contact relations intact", async () => {
    const company = await seedCompany();
    const contact = await seedContact(company.id);
    const deal = await createTestDeal(company);

    try {
      await updateDealAction(
        deal.id,
        { error: null },
        formData({
          name: "Deal aktualisiert",
          companyId: company.id,
          contactId: contact.id,
          service: "SEO",
          valueCents: "2000",
          expectedVersion: String(deal.version),
        }),
      );
    } catch {
      // redirect - erwartet.
    }

    const updated = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updated.name).toBe("Deal aktualisiert");
    expect(updated.contactId).toBe(contact.id);
    expect(updated.service).toBe("SEO");
    expect(updated.version).toBe(deal.version + 1);

    const companyStillExists = await prisma.company.findUnique({ where: { id: company.id } });
    expect(companyStillExists).not.toBeNull();
  });

  it("rejects an edit with a stale expectedVersion (OCC on the plain edit form too)", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    const result = await updateDealAction(
      deal.id,
      { error: null },
      formData({
        name: "Sollte nicht durchgehen",
        companyId: company.id,
        service: "WEBSITE",
        valueCents: "1000",
        expectedVersion: String(deal.version + 5),
      }),
    );

    expect(result.error).toMatch(/zwischenzeitlich/);
    const unchanged = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(unchanged.name).toBe(deal.name);
  });

  it("soft-deletes a deal: deletedAt set, removed from normal list, AuditLog written", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    await deleteDealAction(deal.id, deal.version);

    const updated = await prisma.deal.findUnique({ where: { id: deal.id } });
    expect(updated?.deletedAt).not.toBeNull();

    const { listDeals } = await import("@/modules/deals/queries");
    const { dealFiltersSchema } = await import("@/validations/deal");
    const { deals } = await listDeals(dealFiltersSchema.parse({}), { page: 1, pageSize: 25 });
    expect(deals.find((d) => d.id === deal.id)).toBeUndefined();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: deal.id, action: "DEAL_DELETED" },
    });
    expect(auditLog).not.toBeNull();
  });
});

describe("Won/Lost/Reopen transitions (real PostgreSQL)", () => {
  async function createTestDeal(company: { id: string }) {
    const name = `Deal-${createId()}`;
    try {
      await createDealAction(
        { error: null },
        formData({ name, companyId: company.id, service: "WEBSITE", valueCents: "1000" }),
      );
    } catch {
      // redirect - erwartet.
    }
    return prisma.deal.findFirstOrThrow({ where: { name } });
  }

  it("OPEN -> WON sets status=WON, closedAt=now, clears lostReason, writes Activity+AuditLog", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    const result = await markDealWonAction({ dealId: deal.id, expectedVersion: deal.version });
    expect(result.success).toBe(true);

    const updated = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updated.status).toBe("WON");
    expect(updated.closedAt).not.toBeNull();
    expect(updated.lostReason).toBeNull();

    const activityTypes = (
      await prisma.activity.findMany({ where: { dealId: deal.id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.type);
    expect(activityTypes).toEqual(["DEAL_CREATED", "DEAL_WON"]);

    const auditActions = (
      await prisma.auditLog.findMany({
        where: { entityId: deal.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((a) => a.action);
    expect(auditActions).toEqual(["DEAL_CREATED", "DEAL_WON"]);
  });

  it("WON -> OPEN (reopen) resets status to OPEN and clears closedAt", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    const won = await markDealWonAction({ dealId: deal.id, expectedVersion: deal.version });
    if (!won.success) throw new Error("unreachable");

    const reopened = await reopenDealAction({ dealId: deal.id, expectedVersion: won.version });
    expect(reopened.success).toBe(true);

    const updated = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updated.status).toBe("OPEN");
    expect(updated.closedAt).toBeNull();
  });

  it("OPEN -> LOST sets status=LOST, closedAt=now, stores the given lostReason", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    const result = await markDealLostAction({
      dealId: deal.id,
      expectedVersion: deal.version,
      lostReason: "PRICE",
      lostReasonNote: "Budget zu klein",
    });
    expect(result.success).toBe(true);

    const updated = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updated.status).toBe("LOST");
    expect(updated.closedAt).not.toBeNull();
    expect(updated.lostReason).toBe("PRICE");
    expect(updated.lostReasonNote).toBe("Budget zu klein");

    const dealLostActivity = await prisma.activity.findFirst({
      where: { dealId: deal.id, type: "DEAL_LOST" },
    });
    expect(dealLostActivity).not.toBeNull();
  });

  it("LOST -> OPEN (reopen) clears lostReason/lostReasonNote - deliberately not preserved", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    const lost = await markDealLostAction({
      dealId: deal.id,
      expectedVersion: deal.version,
      lostReason: "NO_BUDGET",
    });
    if (!lost.success) throw new Error("unreachable");

    const reopened = await reopenDealAction({ dealId: deal.id, expectedVersion: lost.version });
    expect(reopened.success).toBe(true);

    const updated = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updated.status).toBe("OPEN");
    expect(updated.lostReason).toBeNull();
    expect(updated.lostReasonNote).toBeNull();

    const reopenedActivity = await prisma.activity.findFirst({
      where: { dealId: deal.id, type: "DEAL_REOPENED" },
    });
    expect(reopenedActivity).not.toBeNull();
  });

  it("allows marking a deal lost without any reason", async () => {
    const company = await seedCompany();
    const deal = await createTestDeal(company);

    const result = await markDealLostAction({ dealId: deal.id, expectedVersion: deal.version });

    expect(result.success).toBe(true);
    const updated = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    expect(updated.status).toBe("LOST");
    expect(updated.lostReason).toBeNull();
  });
});

describe("Dashboard Deal aggregate (real PostgreSQL)", () => {
  it("getDealDashboardSummary only counts real, non-deleted deals by status", async () => {
    const company = await seedCompany();
    const { getDealDashboardSummary } = await import("@/modules/deals/queries");

    try {
      await createDealAction(
        { error: null },
        formData({
          name: "Offener Deal",
          companyId: company.id,
          service: "WEBSITE",
          valueCents: "1000",
        }),
      );
    } catch {
      /* redirect */
    }
    const openDeal = await prisma.deal.findFirstOrThrow({ where: { name: "Offener Deal" } });

    try {
      await createDealAction(
        { error: null },
        formData({
          name: "Gewonnener Deal",
          companyId: company.id,
          service: "WEBSITE",
          valueCents: "4000",
        }),
      );
    } catch {
      /* redirect */
    }
    const wonDeal = await prisma.deal.findFirstOrThrow({ where: { name: "Gewonnener Deal" } });
    await markDealWonAction({ dealId: wonDeal.id, expectedVersion: wonDeal.version });

    try {
      await createDealAction(
        { error: null },
        formData({
          name: "Verlorener Deal",
          companyId: company.id,
          service: "WEBSITE",
          valueCents: "9000",
        }),
      );
    } catch {
      /* redirect */
    }
    const lostDeal = await prisma.deal.findFirstOrThrow({ where: { name: "Verlorener Deal" } });
    await markDealLostAction({ dealId: lostDeal.id, expectedVersion: lostDeal.version });

    const summary = await getDealDashboardSummary();

    expect(summary.openDeals).toBe(1);
    expect(summary.openDealsValueCents).toBe(openDeal.valueCents);
    expect(summary.wonDeals).toBe(1);
    expect(summary.lostDeals).toBe(1);
  });
});
