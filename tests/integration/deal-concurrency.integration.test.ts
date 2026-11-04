import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { markDealWonAction, markDealLostAction } = await import("@/modules/deals/actions");

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

// Optimistic-Concurrency-Control-Test für Deals (Punkt 31 der Spec): zwei
// parallele Statusänderungen desselben Deals mit derselben erwarteten
// Version. Erwartung: genau EIN Update erfolgreich, das zweite erhält einen
// kontrollierten Conflict - kein Lost Update, keine widersprüchlichen
// Activity-Einträge, kein unhandled DB-Fehler.
describe("Concurrent status changes on the same deal (real PostgreSQL, OCC)", () => {
  it("lets exactly one of two simultaneous status changes with the same expectedVersion succeed", async () => {
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const deal = await prisma.deal.create({
      data: {
        id: createId(),
        name: "Concurrency Deal",
        companyId: company.id,
        service: "WEBSITE",
        valueCents: 10000,
      },
    });
    expect(deal.version).toBe(1);

    const [wonResult, lostResult] = await Promise.all([
      markDealWonAction({ dealId: deal.id, expectedVersion: 1 }),
      markDealLostAction({ dealId: deal.id, expectedVersion: 1, lostReason: "PRICE" }),
    ]);

    const results = [wonResult, lostResult];
    const succeeded = results.filter((r) => r.success);
    const conflicted = results.filter((r) => !r.success);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);
    if (!conflicted[0].success) {
      expect(conflicted[0].error).toMatch(/zwischenzeitlich/);
    }

    const final = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    // Die finale Version entspricht genau einem Schritt - kein Lost Update,
    // bei dem der Verlierer heimlich doch noch geschrieben hätte.
    expect(final.version).toBe(2);
    expect(["WON", "LOST"]).toContain(final.status);

    // Keine zwei widersprüchlichen Timeline-Einträge: genau EIN
    // Status-Activity-Eintrag für diesen Deal, nicht zwei.
    const statusActivities = await prisma.activity.findMany({
      where: { dealId: deal.id, type: { in: ["DEAL_WON", "DEAL_LOST"] } },
    });
    expect(statusActivities).toHaveLength(1);

    const statusAudits = await prisma.auditLog.findMany({
      where: { entityId: deal.id, action: { in: ["DEAL_WON", "DEAL_LOST"] } },
    });
    expect(statusAudits).toHaveLength(1);
  });

  it("retries with the fresh version and succeeds after a conflict (no permanent lockout)", async () => {
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const deal = await prisma.deal.create({
      data: {
        id: createId(),
        name: "Concurrency Deal Retry",
        companyId: company.id,
        service: "WEBSITE",
        valueCents: 10000,
      },
    });

    const [won, lost] = await Promise.all([
      markDealWonAction({ dealId: deal.id, expectedVersion: 1 }),
      markDealLostAction({ dealId: deal.id, expectedVersion: 1 }),
    ]);
    const loser = !won.success ? won : lost;
    expect(loser.success).toBe(false);

    const current = await prisma.deal.findUniqueOrThrow({ where: { id: deal.id } });
    const { reopenDealAction } = await import("@/modules/deals/actions");
    const retried = await reopenDealAction({ dealId: deal.id, expectedVersion: current.version });

    expect(retried.success).toBe(true);
  });
});
