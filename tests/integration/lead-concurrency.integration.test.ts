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

const { moveLeadStageAction } = await import("@/modules/leads/actions");

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

// Optimistic-Concurrency-Control-Test: Zwei parallele Stage-Moves desselben
// Leads mit derselben erwarteten Version. Erwartung (Punkt 37 der Spec):
// genau EIN Update erfolgreich, das zweite erhält einen kontrollierten
// Conflict - kein Lost Update, kein widersprüchlicher Timeline-Eintrag,
// kein unbehandelter DB-Fehler.
describe("Concurrent stage moves on the same lead (real PostgreSQL, OCC)", () => {
  it("lets exactly one of two simultaneous moves with the same expectedVersion succeed", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: {
          create: [
            { id: createId(), name: "Stufe A", position: 1 },
            { id: createId(), name: "Stufe B", position: 2 },
            { id: createId(), name: "Stufe C", position: 3 },
          ],
        },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const [stageA, stageB, stageC] = pipeline.stages;
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const lead = await prisma.lead.create({
      data: {
        id: createId(),
        title: "Concurrency Lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: stageA.id,
      },
    });
    expect(lead.version).toBe(1);

    const [resultToB, resultToC] = await Promise.all([
      moveLeadStageAction({ leadId: lead.id, toStageId: stageB.id, expectedVersion: 1 }),
      moveLeadStageAction({ leadId: lead.id, toStageId: stageC.id, expectedVersion: 1 }),
    ]);

    const results = [resultToB, resultToC];
    const succeeded = results.filter((r) => r.success);
    const conflicted = results.filter((r) => !r.success);

    // Genau EIN Update erfolgreich, das andere ein kontrollierter Conflict -
    // kein unhandled DB-Fehler (Promise.all würde sonst rejecten) und kein
    // stiller "letzter gewinnt ohne Fehler"-Zustand.
    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0].success).toBe(false);
    if (!conflicted[0].success) {
      expect(conflicted[0].error).toMatch(/zwischenzeitlich/);
    }

    const final = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    // Die finale Stufe entspricht genau der des erfolgreichen Updates - kein
    // Lost Update, bei dem der Verlierer heimlich doch noch geschrieben hätte.
    expect([stageB.id, stageC.id]).toContain(final.stageId);
    expect(final.version).toBe(2);

    // Keine zwei widersprüchlichen Timeline-Einträge: genau ein
    // LEAD_STAGE_CHANGED-Eintrag für diesen Lead, nicht zwei.
    const stageChangedActivities = await prisma.activity.findMany({
      where: { leadId: lead.id, type: "LEAD_STAGE_CHANGED" },
    });
    expect(stageChangedActivities).toHaveLength(1);

    const stageChangedAudits = await prisma.auditLog.findMany({
      where: { entityId: lead.id, action: "LEAD_STAGE_CHANGED" },
    });
    expect(stageChangedAudits).toHaveLength(1);
  });

  it("retries with the fresh version and succeeds after a conflict (no permanent lockout)", async () => {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: {
          create: [
            { id: createId(), name: "Stufe A", position: 1 },
            { id: createId(), name: "Stufe B", position: 2 },
            { id: createId(), name: "Stufe C", position: 3 },
          ],
        },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const [stageA, stageB, stageC] = pipeline.stages;
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const lead = await prisma.lead.create({
      data: {
        id: createId(),
        title: "Concurrency Lead Retry",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: stageA.id,
      },
    });

    const [first, second] = await Promise.all([
      moveLeadStageAction({ leadId: lead.id, toStageId: stageB.id, expectedVersion: 1 }),
      moveLeadStageAction({ leadId: lead.id, toStageId: stageC.id, expectedVersion: 1 }),
    ]);
    const loser = !first.success ? first : second;
    expect(loser.success).toBe(false);

    const current = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const retried = await moveLeadStageAction({
      leadId: lead.id,
      toStageId: current.stageId === stageB.id ? stageC.id : stageB.id,
      expectedVersion: current.version,
    });

    expect(retried.success).toBe(true);
  });
});
