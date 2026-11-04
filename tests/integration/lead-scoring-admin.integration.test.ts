import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let adminUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => adminUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { updateLeadScoreRulesAction } = await import("@/modules/leads/score-rules-actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function seedActiveLead(source: "LINKEDIN" | null) {
  const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
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
      companyId: company.id,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      source,
      score: 0,
    },
  });
}

beforeEach(async () => {
  adminUser = await prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash: "x",
      firstName: "Admin",
      lastName: "User",
      role: "ADMIN",
    },
  });
});

describe("updateLeadScoreRulesAction (real PostgreSQL)", () => {
  it("updates the configured points/enabled state and writes LEAD_SCORING_UPDATED", async () => {
    const result = await updateLeadScoreRulesAction(
      { error: null, recalculatedCount: null },
      formData({
        points_LINKEDIN_SOURCE: "25",
        enabled_LINKEDIN_SOURCE: "on",
        points_DACH_COMPANY: "10",
        points_SME_COMPANY: "10",
        points_NEED_IDENTIFIED: "0",
        // NEED_IDENTIFIED absichtlich ohne enabled_-Feld -> deaktiviert.
      }),
    );

    expect(result.error).toBeNull();

    const linkedinRule = await prisma.leadScoreRule.findUniqueOrThrow({
      where: { rule: "LINKEDIN_SOURCE" },
    });
    expect(linkedinRule.points).toBe(25);
    expect(linkedinRule.enabled).toBe(true);

    const needRule = await prisma.leadScoreRule.findUniqueOrThrow({
      where: { rule: "NEED_IDENTIFIED" },
    });
    expect(needRule.enabled).toBe(false);

    const auditLog = await prisma.auditLog.findFirst({
      where: { action: "LEAD_SCORING_UPDATED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("recalculates and persists the score of active leads using the new rule values", async () => {
    const lead = await seedActiveLead("LINKEDIN");
    expect(lead.score).toBe(0);

    const result = await updateLeadScoreRulesAction(
      { error: null, recalculatedCount: null },
      formData({
        points_LINKEDIN_SOURCE: "50",
        enabled_LINKEDIN_SOURCE: "on",
        points_DACH_COMPANY: "10",
        points_SME_COMPANY: "10",
        points_NEED_IDENTIFIED: "30",
      }),
    );

    expect(result.recalculatedCount).toBeGreaterThanOrEqual(1);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.score).toBe(50);
  });

  it("does not recalculate a soft-deleted lead's score", async () => {
    const lead = await seedActiveLead("LINKEDIN");
    await prisma.lead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });

    await updateLeadScoreRulesAction(
      { error: null, recalculatedCount: null },
      formData({
        points_LINKEDIN_SOURCE: "999",
        enabled_LINKEDIN_SOURCE: "on",
        points_DACH_COMPANY: "10",
        points_SME_COMPANY: "10",
        points_NEED_IDENTIFIED: "30",
      }),
    );

    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(unchanged.score).toBe(0);
  });

  it("rejects a negative points value", async () => {
    const result = await updateLeadScoreRulesAction(
      { error: null, recalculatedCount: null },
      formData({
        points_LINKEDIN_SOURCE: "-5",
        points_DACH_COMPANY: "10",
        points_SME_COMPANY: "10",
        points_NEED_IDENTIFIED: "30",
      }),
    );

    expect(result.error).toBeTruthy();
  });
});

describe("USER kann Lead-Scoring-Actions nicht ausführen (real PostgreSQL)", () => {
  it("throws ForbiddenError for a plain USER", async () => {
    adminUser = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "Plain",
        lastName: "User",
        role: "USER",
      },
    });

    await expect(
      updateLeadScoreRulesAction(
        { error: null, recalculatedCount: null },
        formData({
          points_LINKEDIN_SOURCE: "10",
          points_DACH_COMPANY: "10",
          points_SME_COMPANY: "10",
          points_NEED_IDENTIFIED: "30",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("score input regression", () => {
  it.each(["1.5", "10junk", "2147483648"])(
    "rejects invalid points %s without mutating rules",
    async (value) => {
      const result = await updateLeadScoreRulesAction(
        { error: null, recalculatedCount: null },
        formData({
          points_LINKEDIN_SOURCE: value,
          points_DACH_COMPANY: "10",
          points_SME_COMPANY: "10",
          points_NEED_IDENTIFIED: "30",
        }),
      );
      expect(result.error).toBeTruthy();
      expect(
        (await prisma.leadScoreRule.findUniqueOrThrow({ where: { rule: "LINKEDIN_SOURCE" } }))
          .points,
      ).toBe(10);
    },
  );
});
