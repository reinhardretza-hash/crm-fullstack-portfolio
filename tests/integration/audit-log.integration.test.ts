import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listAuditLogs } from "@/modules/audit/queries";
import { auditFiltersSchema } from "@/validations/audit";

describe("listAuditLogs (real PostgreSQL)", () => {
  it("filters by userId, action, and entityType", async () => {
    const userA = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "A",
        lastName: "User",
      },
    });
    const userB = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "B",
        lastName: "User",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        userId: userA.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: userA.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        userId: userB.id,
        action: "TAG_CREATED",
        entityType: "Tag",
        entityId: createId(),
      },
    });

    const { logs } = await listAuditLogs(auditFiltersSchema.parse({ userId: userA.id }), {
      page: 1,
      pageSize: 25,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("USER_CREATED");

    const { logs: actionLogs } = await listAuditLogs(
      auditFiltersSchema.parse({ action: "TAG_CREATED" }),
      { page: 1, pageSize: 25 },
    );
    expect(actionLogs).toHaveLength(1);
    expect(actionLogs[0].entityType).toBe("Tag");
  });

  it("filters by date range", async () => {
    const user = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "A",
        lastName: "User",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        userId: user.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorType: "USER",
        userId: user.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: user.id,
        createdAt: new Date("2026-06-15T00:00:00Z"),
      },
    });

    const { logs } = await listAuditLogs(
      auditFiltersSchema.parse({ dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { page: 1, pageSize: 25 },
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("USER_UPDATED");
  });

  it("paginates instead of loading the entire table at once", async () => {
    const user = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "A",
        lastName: "User",
      },
    });

    await prisma.auditLog.createMany({
      data: Array.from({ length: 30 }, () => ({
        actorType: "USER" as const,
        userId: user.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: user.id,
      })),
    });

    const { logs, totalCount, totalPages } = await listAuditLogs(auditFiltersSchema.parse({}), {
      page: 1,
      pageSize: 25,
    });
    expect(logs).toHaveLength(25);
    expect(totalCount).toBe(30);
    expect(totalPages).toBe(2);
  });

  it("orders newest first", async () => {
    const user = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "x",
        firstName: "A",
        lastName: "User",
      },
    });

    const older = await prisma.auditLog.create({
      data: {
        actorType: "USER",
        userId: user.id,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });
    const newer = await prisma.auditLog.create({
      data: {
        actorType: "USER",
        userId: user.id,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: user.id,
        createdAt: new Date("2026-06-15T00:00:00Z"),
      },
    });

    const { logs } = await listAuditLogs(auditFiltersSchema.parse({}), { page: 1, pageSize: 25 });
    expect(logs[0].id).toBe(newer.id);
    expect(logs[1].id).toBe(older.id);
  });
});

describe("inclusive Berlin audit date regression", () => {
  it("includes both edges of a selected Berlin calendar day", async () => {
    const filters = auditFiltersSchema.parse({ dateFrom: "2026-10-01", dateTo: "2026-10-01" });
    expect(filters.dateFrom?.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(filters.dateTo?.toISOString()).toBe("2026-10-01T21:59:59.999Z");
    await prisma.auditLog.createMany({
      data: [
        "2026-09-30T21:59:59.999Z",
        "2026-09-30T22:00:00.000Z",
        "2026-10-01T21:59:59.999Z",
        "2026-10-01T22:00:00.000Z",
      ].map((createdAt) => ({
        actorType: "SYSTEM" as const,
        action: "TEST",
        entityType: "User",
        createdAt: new Date(createdAt),
      })),
    });
    expect((await listAuditLogs(filters, { page: 1, pageSize: 25 })).totalCount).toBe(2);
  });
});
