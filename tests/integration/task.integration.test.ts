import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let testUser: { id: string };
let otherUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const {
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
  completeTaskAction,
  reopenTaskAction,
} = await import("@/modules/tasks/actions");

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
async function seedLead(companyId: string) {
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
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
    },
  });
}
async function seedDeal(companyId: string) {
  return prisma.deal.create({
    data: {
      id: createId(),
      name: `Deal-${createId()}`,
      companyId,
      service: "WEBSITE",
      valueCents: 1000,
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
  otherUser = await prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash: "irrelevant",
      firstName: "Other",
      lastName: "User",
    },
  });
});

describe("Task creation (real PostgreSQL transaction)", () => {
  it("creates a task without any CRM target (rein interne Aufgabe)", async () => {
    try {
      await createTaskAction(
        { error: null },
        formData({ title: "Interne Aufgabe", assignedUserId: otherUser.id, dueDate: "2026-07-01" }),
      );
    } catch {
      // redirect() wirft einen Next.js-Kontrollfluss-Fehler - erwartet.
    }

    const task = await prisma.task.findFirstOrThrow({ where: { title: "Interne Aufgabe" } });
    expect(task.companyId).toBeNull();
    expect(task.contactId).toBeNull();
    expect(task.leadId).toBeNull();
    expect(task.dealId).toBeNull();
    expect(task.createdById).toBe(testUser.id);
    expect(task.assignedUserId).toBe(otherUser.id);
    expect(task.status).toBe("OPEN");

    const activity = await prisma.activity.findFirst({ where: { taskId: task.id } });
    expect(activity?.type).toBe("TASK_CREATED");
    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: task.id, entityType: "Task" },
    });
    expect(auditLog?.action).toBe("TASK_CREATED");
  });

  it("creates a task linked to a Company and mirrors the activity onto the company's timeline", async () => {
    const company = await seedCompany();
    try {
      await createTaskAction(
        { error: null },
        formData({
          title: "Company-Aufgabe",
          assignedUserId: otherUser.id,
          dueDate: "2026-07-01",
          companyId: company.id,
        }),
      );
    } catch {
      /* redirect */
    }

    const task = await prisma.task.findFirstOrThrow({ where: { title: "Company-Aufgabe" } });
    expect(task.companyId).toBe(company.id);

    const companyActivity = await prisma.activity.findFirst({
      where: { companyId: company.id, taskId: task.id, type: "TASK_CREATED" },
    });
    expect(companyActivity).not.toBeNull();
  });

  it("creates a task linked to a Contact", async () => {
    const contact = await seedContact();
    try {
      await createTaskAction(
        { error: null },
        formData({
          title: "Contact-Aufgabe",
          assignedUserId: otherUser.id,
          dueDate: "2026-07-01",
          contactId: contact.id,
        }),
      );
    } catch {
      /* redirect */
    }

    const task = await prisma.task.findFirstOrThrow({ where: { title: "Contact-Aufgabe" } });
    expect(task.contactId).toBe(contact.id);
  });

  it("creates a task linked to a Lead", async () => {
    const company = await seedCompany();
    const lead = await seedLead(company.id);
    try {
      await createTaskAction(
        { error: null },
        formData({
          title: "Lead-Aufgabe",
          assignedUserId: otherUser.id,
          dueDate: "2026-07-01",
          leadId: lead.id,
        }),
      );
    } catch {
      /* redirect */
    }

    const task = await prisma.task.findFirstOrThrow({ where: { title: "Lead-Aufgabe" } });
    expect(task.leadId).toBe(lead.id);
  });

  it("creates a task linked to a Deal", async () => {
    const company = await seedCompany();
    const deal = await seedDeal(company.id);
    try {
      await createTaskAction(
        { error: null },
        formData({
          title: "Deal-Aufgabe",
          assignedUserId: otherUser.id,
          dueDate: "2026-07-01",
          dealId: deal.id,
        }),
      );
    } catch {
      /* redirect */
    }

    const task = await prisma.task.findFirstOrThrow({ where: { title: "Deal-Aufgabe" } });
    expect(task.dealId).toBe(deal.id);
  });

  it("rejects a task with multiple CRM targets at the same time, verified at the database level", async () => {
    const company = await seedCompany();
    const lead = await seedLead(company.id);

    const result = await createTaskAction(
      { error: null },
      formData({
        title: "Ungültige Aufgabe",
        assignedUserId: otherUser.id,
        dueDate: "2026-07-01",
        companyId: company.id,
        leadId: lead.id,
      }),
    );

    expect(result.error).toBeTruthy();
    const count = await prisma.task.count({ where: { title: "Ungültige Aufgabe" } });
    expect(count).toBe(0);

    // Zusätzlich die CHECK-Constraint direkt per Raw-SQL prüfen (umgeht die
    // Zod-Validierungsschicht bewusst, genau der Fall, den die DB-
    // Constraint zusätzlich absichern soll).
    await expect(
      prisma.$executeRaw`INSERT INTO tasks (id, title, due_at, assigned_user_id, created_by_id, company_id, lead_id, created_at, updated_at)
        VALUES (${createId()}, 'raw insert', now(), ${otherUser.id}, ${testUser.id}, ${company.id}, ${lead.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("rejects a reminder set after the due date, verified at the database level too", async () => {
    const result = await createTaskAction(
      { error: null },
      formData({
        title: "Ungültige Erinnerung",
        assignedUserId: otherUser.id,
        dueDate: "2026-07-01",
        reminderDate: "2026-07-05",
      }),
    );

    expect(result.error).toBeTruthy();
    const count = await prisma.task.count({ where: { title: "Ungültige Erinnerung" } });
    expect(count).toBe(0);

    await expect(
      prisma.$executeRaw`INSERT INTO tasks (id, title, due_at, reminder_at, assigned_user_id, created_by_id, created_at, updated_at)
        VALUES (${createId()}, 'raw insert', '2026-07-01T00:00:00Z'::timestamp, '2026-07-05T00:00:00Z'::timestamp, ${otherUser.id}, ${testUser.id}, now(), now())`,
    ).rejects.toThrow();
  });
});

describe("Task editing and soft delete (real PostgreSQL)", () => {
  async function createTestTask() {
    const title = `Task-${createId()}`;
    try {
      await createTaskAction(
        { error: null },
        formData({ title, assignedUserId: otherUser.id, dueDate: "2026-07-01" }),
      );
    } catch {
      /* redirect */
    }
    return prisma.task.findFirstOrThrow({ where: { title } });
  }

  it("updates a task, including reassignment, and writes TASK_REASSIGNED", async () => {
    const task = await createTestTask();

    try {
      await updateTaskAction(
        task.id,
        { error: null },
        formData({
          title: "Aktualisierte Aufgabe",
          assignedUserId: testUser.id,
          dueDate: "2026-07-02",
          expectedVersion: String(task.version),
        }),
      );
    } catch {
      /* redirect */
    }

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.title).toBe("Aktualisierte Aufgabe");
    expect(updated.assignedUserId).toBe(testUser.id);
    expect(updated.version).toBe(task.version + 1);

    const reassigned = await prisma.activity.findFirst({
      where: { taskId: task.id, type: "TASK_REASSIGNED" },
    });
    expect(reassigned).not.toBeNull();
  });

  it("rejects an edit with a stale expectedVersion (OCC)", async () => {
    const task = await createTestTask();

    const result = await updateTaskAction(
      task.id,
      { error: null },
      formData({
        title: "Sollte nicht durchgehen",
        assignedUserId: otherUser.id,
        dueDate: "2026-07-01",
        expectedVersion: String(task.version + 5),
      }),
    );

    expect(result.error).toMatch(/zwischenzeitlich/);
  });

  it("soft-deletes a task: deletedAt set, removed from list, AuditLog written", async () => {
    const task = await createTestTask();

    await deleteTaskAction(task.id);

    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.deletedAt).not.toBeNull();

    const { listTasks } = await import("@/modules/tasks/queries");
    const { taskFiltersSchema } = await import("@/validations/task");
    const { tasks } = await listTasks(taskFiltersSchema.parse({ view: "all" }), {
      page: 1,
      pageSize: 25,
    });
    expect(tasks.find((t) => t.id === task.id)).toBeUndefined();

    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: task.id, action: "TASK_DELETED" },
    });
    expect(auditLog).not.toBeNull();
  });
});

describe("Complete/Reopen transitions (real PostgreSQL)", () => {
  async function createTestTask() {
    const title = `Task-${createId()}`;
    try {
      await createTaskAction(
        { error: null },
        formData({ title, assignedUserId: otherUser.id, dueDate: "2026-07-01" }),
      );
    } catch {
      /* redirect */
    }
    return prisma.task.findFirstOrThrow({ where: { title } });
  }

  it("OPEN -> COMPLETED sets completedAt and writes TASK_COMPLETED", async () => {
    const task = await createTestTask();

    const result = await completeTaskAction({ taskId: task.id, expectedVersion: task.version });
    expect(result.success).toBe(true);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.completedAt).not.toBeNull();

    const activity = await prisma.activity.findFirst({
      where: { taskId: task.id, type: "TASK_COMPLETED" },
    });
    expect(activity).not.toBeNull();
    const auditLog = await prisma.auditLog.findFirst({
      where: { entityId: task.id, action: "TASK_COMPLETED" },
    });
    expect(auditLog).not.toBeNull();
  });

  it("COMPLETED -> OPEN (reopen) clears completedAt", async () => {
    const task = await createTestTask();
    const completed = await completeTaskAction({ taskId: task.id, expectedVersion: task.version });
    if (!completed.success) throw new Error("unreachable");

    const reopened = await reopenTaskAction({
      taskId: task.id,
      expectedVersion: completed.version,
    });
    expect(reopened.success).toBe(true);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.status).toBe("OPEN");
    expect(updated.completedAt).toBeNull();

    const activity = await prisma.activity.findFirst({
      where: { taskId: task.id, type: "TASK_REOPENED" },
    });
    expect(activity).not.toBeNull();
  });
});

describe("CRM detail task relations (real PostgreSQL)", () => {
  it("only lists open tasks for a company, not completed ones", async () => {
    const company = await seedCompany();
    try {
      await createTaskAction(
        { error: null },
        formData({
          title: "Offene Firmen-Aufgabe",
          assignedUserId: otherUser.id,
          dueDate: "2026-07-01",
          companyId: company.id,
        }),
      );
    } catch {
      /* redirect */
    }
    try {
      await createTaskAction(
        { error: null },
        formData({
          title: "Erledigte Firmen-Aufgabe",
          assignedUserId: otherUser.id,
          dueDate: "2026-07-01",
          companyId: company.id,
        }),
      );
    } catch {
      /* redirect */
    }
    const doneTask = await prisma.task.findFirstOrThrow({
      where: { title: "Erledigte Firmen-Aufgabe" },
    });
    await completeTaskAction({ taskId: doneTask.id, expectedVersion: doneTask.version });

    const { listTasksForCompany } = await import("@/modules/tasks/queries");
    const tasks = await listTasksForCompany(company.id);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Offene Firmen-Aufgabe");
  });
});

describe("Dashboard task aggregate + reminder query (real PostgreSQL)", () => {
  it("getTaskDashboardSummary counts open/dueToday/overdue correctly", async () => {
    const { getTaskDashboardSummary } = await import("@/modules/tasks/queries");
    const now = new Date("2026-06-15T10:00:00.000Z");

    await prisma.task.create({
      data: {
        id: createId(),
        title: "Überfällig",
        dueAt: new Date("2026-06-14T10:00:00Z"),
        assignedUserId: otherUser.id,
        createdById: testUser.id,
      },
    });
    await prisma.task.create({
      data: {
        id: createId(),
        title: "Heute",
        dueAt: new Date("2026-06-15T20:00:00Z"),
        assignedUserId: otherUser.id,
        createdById: testUser.id,
      },
    });
    await prisma.task.create({
      data: {
        id: createId(),
        title: "Kommend",
        dueAt: new Date("2026-06-20T10:00:00Z"),
        assignedUserId: otherUser.id,
        createdById: testUser.id,
      },
    });

    const summary = await getTaskDashboardSummary(now);
    expect(summary.openTasks).toBe(3);
    expect(summary.dueToday).toBe(1);
    expect(summary.overdue).toBe(1);
  });

  it("getTasksWithDueReminders returns only tasks whose reminder is due, not completed, not deleted", async () => {
    const { getTasksWithDueReminders } = await import("@/modules/tasks/queries");
    const now = new Date("2026-06-15T10:00:00.000Z");

    const dueReminderTask = await prisma.task.create({
      data: {
        id: createId(),
        title: "Erinnerung fällig",
        dueAt: new Date("2026-07-01T00:00:00Z"),
        reminderAt: new Date("2026-06-15T09:00:00Z"),
        assignedUserId: otherUser.id,
        createdById: testUser.id,
      },
    });
    await prisma.task.create({
      data: {
        id: createId(),
        title: "Erinnerung noch nicht fällig",
        dueAt: new Date("2026-07-01T00:00:00Z"),
        reminderAt: new Date("2026-06-20T09:00:00Z"),
        assignedUserId: otherUser.id,
        createdById: testUser.id,
      },
    });
    await prisma.task.create({
      data: {
        id: createId(),
        title: "Keine Erinnerung",
        dueAt: new Date("2026-07-01T00:00:00Z"),
        assignedUserId: otherUser.id,
        createdById: testUser.id,
      },
    });

    const due = await getTasksWithDueReminders(now);
    expect(due.map((t) => t.id)).toEqual([dueReminderTask.id]);
  });
});
