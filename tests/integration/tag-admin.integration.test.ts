import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { normalizeTagName } from "@/lib/normalize";

let adminUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => adminUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { createTagAction, renameTagAction, deleteTagAction } = await import(
  "@/modules/tags/admin-actions"
);

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
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

describe("createTagAction (real PostgreSQL)", () => {
  it("creates a tag with a normalized name and writes TAG_CREATED", async () => {
    const result = await createTagAction({ error: null }, formData({ name: "Handwerk" }));
    expect(result.error).toBeNull();

    const tag = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Handwerk") },
    });
    expect(tag.name).toBe("Handwerk");

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: tag.id, action: "TAG_CREATED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("rejects a duplicate tag name", async () => {
    await createTagAction({ error: null }, formData({ name: "Software" }));
    const result = await createTagAction({ error: null }, formData({ name: "software" }));

    expect(result.error).toBe("Ein Tag mit diesem Namen existiert bereits.");
  });
});

describe("renameTagAction (real PostgreSQL)", () => {
  it("renames a tag and updates normalizedName correctly", async () => {
    await createTagAction({ error: null }, formData({ name: "Handwerk" }));
    const tag = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Handwerk") },
    });

    const result = await renameTagAction(tag.id, { error: null }, formData({ name: "Bauwesen" }));
    expect(result.error).toBeNull();

    const renamed = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } });
    expect(renamed.name).toBe("Bauwesen");
    expect(renamed.normalizedName).toBe(normalizeTagName("Bauwesen"));
  });

  it("merges into an existing tag when renaming to an already-used name, carrying over all assignments", async () => {
    await createTagAction({ error: null }, formData({ name: "Handwerk" }));
    await createTagAction({ error: null }, formData({ name: "Software" }));
    const handwerk = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Handwerk") },
    });
    const software = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Software") },
    });

    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    await prisma.companyTag.create({ data: { companyId: company.id, tagId: handwerk.id } });

    const result = await renameTagAction(handwerk.id, { error: null }, formData({ name: "Software" }));
    expect(result.error).toBeNull();

    // Der umbenannte Tag ("Handwerk") existiert nicht mehr - zusammengeführt
    // in den bereits vorhandenen "Software"-Tag.
    const oldTagStillExists = await prisma.tag.findUnique({ where: { id: handwerk.id } });
    expect(oldTagStillExists).toBeNull();

    // Die Company-Zuordnung wurde auf den Ziel-Tag übernommen, nicht verloren.
    const companyTag = await prisma.companyTag.findFirst({
      where: { companyId: company.id, tagId: software.id },
    });
    expect(companyTag).not.toBeNull();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: software.id, action: "TAG_UPDATED" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog?.metadata).toEqual(
      expect.objectContaining({ mergedFromTagId: handwerk.id, mergedFromName: "Handwerk" }),
    );
  });

  it("does not lose a company that was already tagged with the target tag during a merge (no duplicate-key crash)", async () => {
    await createTagAction({ error: null }, formData({ name: "Handwerk" }));
    await createTagAction({ error: null }, formData({ name: "Software" }));
    const handwerk = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Handwerk") },
    });
    const software = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Software") },
    });

    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    // Bereits mit BEIDEN Tags verknüpft, bevor der Merge passiert.
    await prisma.companyTag.create({ data: { companyId: company.id, tagId: handwerk.id } });
    await prisma.companyTag.create({ data: { companyId: company.id, tagId: software.id } });

    const result = await renameTagAction(handwerk.id, { error: null }, formData({ name: "Software" }));
    expect(result.error).toBeNull();

    const companyTags = await prisma.companyTag.findMany({ where: { companyId: company.id } });
    expect(companyTags).toHaveLength(1);
    expect(companyTags[0].tagId).toBe(software.id);
  });
});

describe("deleteTagAction (real PostgreSQL)", () => {
  it("removes the tag and its join rows, but never the Company/Contact itself", async () => {
    await createTagAction({ error: null }, formData({ name: "Handwerk" }));
    const tag = await prisma.tag.findUniqueOrThrow({
      where: { normalizedName: normalizeTagName("Handwerk") },
    });
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    await prisma.companyTag.create({ data: { companyId: company.id, tagId: tag.id } });

    const result = await deleteTagAction(tag.id);
    expect(result.success).toBe(true);

    expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
    expect(
      await prisma.companyTag.findFirst({ where: { companyId: company.id, tagId: tag.id } }),
    ).toBeNull();
    // Die Company selbst bleibt unangetastet.
    expect(await prisma.company.findUnique({ where: { id: company.id } })).not.toBeNull();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: tag.id, action: "TAG_DELETED" },
    });
    expect(auditLog).not.toBeNull();
  });
});

describe("USER kann Tag-Admin-Actions nicht ausführen (real PostgreSQL)", () => {
  it("createTagAction throws ForbiddenError for a plain USER", async () => {
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

    await expect(createTagAction({ error: null }, formData({ name: "Blocked" }))).rejects.toThrow();
  });
});
