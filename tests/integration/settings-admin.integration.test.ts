import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let ownerUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => ownerUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { updateSettingsAction } = await import("@/modules/settings/actions");
const { ensureSystemSettings } = await import("@/modules/settings/queries");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function seedPipeline(isDefault: boolean) {
  return prisma.pipeline.create({
    data: {
      id: createId(),
      name: `Pipeline-${createId()}`,
      isDefault,
      stages: { create: [{ id: createId(), name: "Stufe 1", position: 1 }] },
    },
  });
}

beforeEach(async () => {
  ownerUser = await prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash: "x",
      firstName: "Owner",
      lastName: "User",
      role: "OWNER",
    },
  });
});

describe("updateSettingsAction (real PostgreSQL)", () => {
  it("updates companyName/timezone/currency and writes SETTINGS_UPDATED", async () => {
    const pipeline = await seedPipeline(true);
    const settings = await ensureSystemSettings();

    const result = await updateSettingsAction(
      { error: null },
      formData({
        companyName: "Neue Firma GmbH",
        timezone: "Europe/Berlin",
        currency: "EUR",
        defaultPipelineId: pipeline.id,
        expectedVersion: String(settings.version),
      }),
    );
    expect(result.error).toBeNull();

    const updated = await prisma.systemSettings.findUniqueOrThrow({ where: { id: settings.id } });
    expect(updated.companyName).toBe("Neue Firma GmbH");
    expect(updated.version).toBe(settings.version + 1);

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: settings.id, action: "SETTINGS_UPDATED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("switches the default pipeline atomically - exactly one pipeline stays isDefault=true", async () => {
    const oldDefault = await seedPipeline(true);
    const newDefault = await seedPipeline(false);
    const settings = await ensureSystemSettings();

    const result = await updateSettingsAction(
      { error: null },
      formData({
        companyName: "RDEvolution GbR",
        timezone: "Europe/Berlin",
        currency: "EUR",
        defaultPipelineId: newDefault.id,
        expectedVersion: String(settings.version),
      }),
    );
    expect(result.error).toBeNull();

    const updatedOld = await prisma.pipeline.findUniqueOrThrow({ where: { id: oldDefault.id } });
    const updatedNew = await prisma.pipeline.findUniqueOrThrow({ where: { id: newDefault.id } });
    expect(updatedOld.isDefault).toBe(false);
    expect(updatedNew.isDefault).toBe(true);
  });

  it("rejects a stale expectedVersion (OCC)", async () => {
    const pipeline = await seedPipeline(true);
    const settings = await ensureSystemSettings();

    const result = await updateSettingsAction(
      { error: null },
      formData({
        companyName: "Sollte nicht durchgehen",
        timezone: "Europe/Berlin",
        currency: "EUR",
        defaultPipelineId: pipeline.id,
        expectedVersion: String(settings.version + 5),
      }),
    );

    expect(result.error).toMatch(/zwischenzeitlich/);
  });

  it("rejects a non-existent default pipeline", async () => {
    const settings = await ensureSystemSettings();

    const result = await updateSettingsAction(
      { error: null },
      formData({
        companyName: "RDEvolution GbR",
        timezone: "Europe/Berlin",
        currency: "EUR",
        defaultPipelineId: "does-not-exist",
        expectedVersion: String(settings.version),
      }),
    );

    expect(result.error).toBeTruthy();
  });
});

describe("ensureSystemSettings - Singleton (real PostgreSQL)", () => {
  it("creates the row idempotently and never more than one", async () => {
    const first = await ensureSystemSettings();
    const second = await ensureSystemSettings();
    expect(first.id).toBe(second.id);

    const count = await prisma.systemSettings.count();
    expect(count).toBe(1);
  });
});

describe("USER kann Settings-Actions nicht ausführen (real PostgreSQL)", () => {
  it("throws ForbiddenError for a plain USER", async () => {
    ownerUser = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "Plain",
        lastName: "User",
        role: "USER",
      },
    });
    const pipeline = await seedPipeline(true);
    const settings = await ensureSystemSettings();

    await expect(
      updateSettingsAction(
        { error: null },
        formData({
          companyName: "Blocked",
          timezone: "Europe/Berlin",
          currency: "EUR",
          defaultPipelineId: pipeline.id,
          expectedVersion: String(settings.version),
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("inactive default pipeline regression", () => {
  it("rejects an inactive default and rolls settings back", async () => {
    const oldDefault = await seedPipeline(true);
    const inactive = await seedPipeline(false);
    await prisma.pipeline.update({ where: { id: inactive.id }, data: { isActive: false } });
    const settings = await ensureSystemSettings();
    const result = await updateSettingsAction(
      { error: null },
      formData({
        companyName: "Should roll back",
        timezone: "Europe/Berlin",
        currency: "EUR",
        defaultPipelineId: inactive.id,
        expectedVersion: String(settings.version),
      }),
    );
    expect(result.error).toMatch(/aktiv/);
    expect((await ensureSystemSettings()).companyName).toBe(settings.companyName);
    expect(
      (await prisma.pipeline.findUniqueOrThrow({ where: { id: oldDefault.id } })).isDefault,
    ).toBe(true);
  });
});
