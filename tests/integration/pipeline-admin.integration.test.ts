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

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { updateStageAction, moveStageAction, deleteStageAction, togglePipelineActiveAction } =
  await import("@/modules/pipeline/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function seedPipeline(options: { isDefault?: boolean } = {}) {
  return prisma.pipeline.create({
    data: {
      id: createId(),
      name: `Pipeline-${createId()}`,
      isDefault: options.isDefault ?? false,
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

describe("updateStageAction - Pipeline Stage bearbeiten (real PostgreSQL)", () => {
  it("updates name/probability/color and writes PIPELINE_STAGE_UPDATED", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[0];

    try {
      await updateStageAction(
        stage.id,
        { error: null },
        formData({
          name: "Umbenannt",
          probability: "40",
          color: "#AABBCC",
          expectedVersion: String(stage.version),
        }),
      );
    } catch {
      // redirect - erwartet.
    }

    const updated = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(updated.name).toBe("Umbenannt");
    expect(updated.probability).toBe(40);
    expect(updated.color).toBe("#AABBCC");
    expect(updated.version).toBe(stage.version + 1);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: stage.id, action: "PIPELINE_STAGE_UPDATED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("rejects a stale expectedVersion (OCC)", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[0];

    const result = await updateStageAction(
      stage.id,
      { error: null },
      formData({ name: "Sollte nicht durchgehen", expectedVersion: String(stage.version + 5) }),
    );

    expect(result?.error).toMatch(/zwischenzeitlich/);
  });

  it("rejects setting both isWonStage and isLostStage", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[0];

    const result = await updateStageAction(
      stage.id,
      { error: null },
      formData({
        name: "Stufe A",
        isWonStage: "on",
        isLostStage: "on",
        expectedVersion: String(stage.version),
      }),
    );

    expect(result?.error).toBeTruthy();
    const unchanged = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(unchanged.isWonStage).toBe(false);
  });

  it("rejects marking a second stage as Won within the same pipeline (DB constraint)", async () => {
    const pipeline = await seedPipeline();
    await prisma.pipelineStage.update({
      where: { id: pipeline.stages[0].id },
      data: { isWonStage: true },
    });
    const secondStage = pipeline.stages[1];

    const result = await updateStageAction(
      secondStage.id,
      { error: null },
      formData({
        name: secondStage.name,
        isWonStage: "on",
        expectedVersion: String(secondStage.version),
      }),
    );

    expect(result?.error).toMatch(/höchstens eine/);
  });
});

describe("moveStageAction - Stage-Reihenfolge (real PostgreSQL)", () => {
  it("swaps positions between a stage and its upward neighbor, no duplicate positions", async () => {
    const pipeline = await seedPipeline();
    const [stageA, stageB] = pipeline.stages;

    const result = await moveStageAction({ stageId: stageB.id, direction: "up" });
    expect(result.success).toBe(true);

    const updatedA = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stageA.id } });
    const updatedB = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stageB.id } });
    expect(updatedB.position).toBe(1);
    expect(updatedA.position).toBe(2);

    const positions = await prisma.pipelineStage.findMany({
      where: { pipelineId: pipeline.id, deletedAt: null },
      select: { position: true },
    });
    const uniquePositions = new Set(positions.map((p) => p.position));
    expect(uniquePositions.size).toBe(positions.length);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: stageB.id, action: "PIPELINE_STAGE_REORDERED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("rejects moving the first stage further up", async () => {
    const pipeline = await seedPipeline();
    const result = await moveStageAction({ stageId: pipeline.stages[0].id, direction: "up" });
    expect(result.success).toBe(false);
  });
});

describe("deleteStageAction - Stage mit Leads kann nicht gelöscht werden (real PostgreSQL)", () => {
  it("blocks deletion when the stage still has active leads, reporting the count", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[0];
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    await prisma.lead.create({
      data: {
        id: createId(),
        title: "Testlead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
      },
    });

    const result = await deleteStageAction(stage.id);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/1 Lead/);
    }
    const unchanged = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(unchanged.deletedAt).toBeNull();
  });

  it("soft-deletes a stage with no leads and writes PIPELINE_STAGE_DELETED", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[2];

    const result = await deleteStageAction(stage.id);

    expect(result.success).toBe(true);
    const deleted = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(deleted.deletedAt).not.toBeNull();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: stage.id, action: "PIPELINE_STAGE_DELETED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("frees up the deleted stage's position for a new stage (partial unique index)", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[2];
    await deleteStageAction(stage.id);

    await expect(
      prisma.pipelineStage.create({
        data: {
          id: createId(),
          pipelineId: pipeline.id,
          name: "Neue Stufe",
          position: stage.position,
        },
      }),
    ).resolves.toBeDefined();
  });
});

describe("togglePipelineActiveAction - Pipeline deaktivieren (real PostgreSQL)", () => {
  it("blocks deactivating the default pipeline", async () => {
    const pipeline = await seedPipeline({ isDefault: true });

    const result = await togglePipelineActiveAction(pipeline.id, false);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Standardpipeline/);
    }
    const unchanged = await prisma.pipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(unchanged.isActive).toBe(true);
  });

  it("allows deactivating a non-default pipeline", async () => {
    await seedPipeline({ isDefault: true });
    const pipeline = await seedPipeline({ isDefault: false });

    const result = await togglePipelineActiveAction(pipeline.id, false);

    expect(result.success).toBe(true);
    const updated = await prisma.pipeline.findUniqueOrThrow({ where: { id: pipeline.id } });
    expect(updated.isActive).toBe(false);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: pipeline.id, action: "PIPELINE_UPDATED" },
    });
    expect(auditLog).not.toBeNull();
  });
});

describe("USER kann Pipeline-Admin-Actions nicht ausführen (real PostgreSQL)", () => {
  it("updateStageAction throws ForbiddenError for a plain USER", async () => {
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
    const pipeline = await seedPipeline();

    await expect(
      updateStageAction(
        pipeline.stages[0].id,
        { error: null },
        formData({ name: "Should fail", expectedVersion: "1" }),
      ),
    ).rejects.toThrow();
  });
});

describe("Phase 6 pipeline regressions", () => {
  it("blocks deactivating the only active pipeline even without a default", async () => {
    const pipeline = await seedPipeline();
    const result = await togglePipelineActiveAction(pipeline.id, false);
    expect(result.success).toBe(false);
    expect((await prisma.pipeline.findUniqueOrThrow({ where: { id: pipeline.id } })).isActive).toBe(
      true,
    );
  });
  it("blocks changing terminal flags on a stage that has active leads", async () => {
    const pipeline = await seedPipeline();
    const stage = pipeline.stages[0];
    const company = await prisma.company.create({ data: { name: "Flag regression" } });
    await prisma.lead.create({
      data: {
        title: "Open lead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
      },
    });
    const result = await updateStageAction(
      stage.id,
      { error: null },
      formData({ name: stage.name, isWonStage: "on", expectedVersion: String(stage.version) }),
    );
    expect(result.error).toMatch(/Markierung/);
    expect(
      (await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } })).isWonStage,
    ).toBe(false);
  });
});

describe("clearing optional stage fields regression", () => {
  it("persists null when probability and color are cleared", async () => {
    const pipeline = await seedPipeline();
    const stage = await prisma.pipelineStage.update({
      where: { id: pipeline.stages[0].id },
      data: { probability: 40, color: "#AABBCC" },
    });
    await expect(
      updateStageAction(
        stage.id,
        { error: null },
        formData({
          name: stage.name,
          probability: "",
          color: "",
          expectedVersion: String(stage.version),
        }),
      ),
    ).rejects.toThrow("REDIRECT:/settings/pipeline");
    const cleared = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
    expect(cleared.probability).toBeNull();
    expect(cleared.color).toBeNull();
  });
});
