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

const { completeTaskAction, reopenTaskAction } = await import("@/modules/tasks/actions");

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

// Optimistic-Concurrency-Control-Test für Tasks (Punkt 42 der Spec): zwei
// parallele Statusänderungen desselben Tasks mit derselben erwarteten
// Version. Erwartung: genau EIN Update erfolgreich, kein Lost Update,
// keine doppelten TASK_COMPLETED-Activities.
describe("Concurrent status changes on the same task (real PostgreSQL, OCC)", () => {
  it("lets exactly one of two simultaneous completes with the same expectedVersion succeed", async () => {
    const task = await prisma.task.create({
      data: {
        id: createId(),
        title: "Concurrency Task",
        dueAt: new Date("2026-07-01T00:00:00Z"),
        assignedUserId: testUser.id,
        createdById: testUser.id,
      },
    });
    expect(task.version).toBe(1);

    const [first, second] = await Promise.all([
      completeTaskAction({ taskId: task.id, expectedVersion: 1 }),
      completeTaskAction({ taskId: task.id, expectedVersion: 1 }),
    ]);

    const results = [first, second];
    const succeeded = results.filter((r) => r.success);
    const conflicted = results.filter((r) => !r.success);

    expect(succeeded).toHaveLength(1);
    expect(conflicted).toHaveLength(1);
    if (!conflicted[0].success) {
      expect(conflicted[0].error).toMatch(/zwischenzeitlich/);
    }

    const final = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(final.status).toBe("COMPLETED");
    expect(final.version).toBe(2);

    // Keine doppelten TASK_COMPLETED-Activities - genau ein Eintrag, nicht
    // zwei, obwohl zwei Requests gleichzeitig versucht haben.
    const completedActivities = await prisma.activity.findMany({
      where: { taskId: task.id, type: "TASK_COMPLETED" },
    });
    expect(completedActivities).toHaveLength(1);

    const completedAudits = await prisma.auditLog.findMany({
      where: { entityId: task.id, action: "TASK_COMPLETED" },
    });
    expect(completedAudits).toHaveLength(1);
  });

  it("retries with the fresh version and succeeds after a conflict (no permanent lockout)", async () => {
    const task = await prisma.task.create({
      data: {
        id: createId(),
        title: "Concurrency Task Retry",
        dueAt: new Date("2026-07-01T00:00:00Z"),
        assignedUserId: testUser.id,
        createdById: testUser.id,
      },
    });

    const [first, second] = await Promise.all([
      completeTaskAction({ taskId: task.id, expectedVersion: 1 }),
      completeTaskAction({ taskId: task.id, expectedVersion: 1 }),
    ]);
    const loser = !first.success ? first : second;
    expect(loser.success).toBe(false);

    const current = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    const retried = await reopenTaskAction({ taskId: task.id, expectedVersion: current.version });

    expect(retried.success).toBe(true);
  });
});
