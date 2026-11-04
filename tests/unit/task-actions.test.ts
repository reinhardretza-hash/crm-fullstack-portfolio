import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const taskCreateMock = vi.fn();
const taskFindFirstMock = vi.fn();
const taskUpdateManyMock = vi.fn();
const activityCreateMock = vi.fn();
const auditLogCreateMock = vi.fn();

const txMock = {
  task: {
    create: taskCreateMock,
    findFirst: taskFindFirstMock,
    updateMany: taskUpdateManyMock,
  },
  activity: { create: activityCreateMock },
  auditLog: { create: auditLogCreateMock },
};

vi.mock("@/server/rbac", () => ({
  requireUser: () => requireUserMock(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txMock) => unknown) => fn(txMock),
    task: { findFirst: taskFindFirstMock },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { createTaskAction, completeTaskAction, reopenTaskAction } =
  await import("@/modules/tasks/actions");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: "user-1" });
  taskCreateMock.mockReset().mockResolvedValue({ id: "task-1" });
  taskFindFirstMock
    .mockReset()
    .mockResolvedValue({
      id: "task-1",
      companyId: null,
      contactId: null,
      leadId: null,
      dealId: null,
    });
  taskUpdateManyMock.mockReset().mockResolvedValue({ count: 1 });
  activityCreateMock.mockReset();
  auditLogCreateMock.mockReset();
});

describe("createTaskAction - at most one CRM target", () => {
  it("rejects two targets set at the same time, even bypassing the client form", async () => {
    const result = await createTaskAction(
      { error: null },
      formData({
        title: "Test",
        assignedUserId: "user-2",
        dueDate: "2026-07-01",
        companyId: "company-1",
        leadId: "lead-1",
      }),
    );

    expect(result.error).toBeTruthy();
    expect(taskCreateMock).not.toHaveBeenCalled();
  });

  it("succeeds with zero targets (a purely internal task)", async () => {
    await expect(
      createTaskAction(
        { error: null },
        formData({ title: "Interne Aufgabe", assignedUserId: "user-2", dueDate: "2026-07-01" }),
      ),
    ).rejects.toThrow("REDIRECT:/tasks/task-1");

    expect(taskCreateMock).toHaveBeenCalled();
  });
});

describe("Task mutations require an authenticated user", () => {
  it("createTaskAction never writes when unauthenticated", async () => {
    requireUserMock.mockImplementation(() => {
      throw new Error("REDIRECT:/login");
    });

    await expect(
      createTaskAction(
        { error: null },
        formData({ title: "Test", assignedUserId: "user-2", dueDate: "2026-07-01" }),
      ),
    ).rejects.toThrow("REDIRECT:/login");
    expect(taskCreateMock).not.toHaveBeenCalled();
  });
});

describe("Optimistic Concurrency Control on status changes", () => {
  it("completeTaskAction returns a controlled conflict when the version no longer matches", async () => {
    taskUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const result = await completeTaskAction({ taskId: "task-1", expectedVersion: 1 });

    expect(result).toEqual({
      success: false,
      error:
        "Die Aufgabe wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
    });
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("completeTaskAction succeeds and writes Activity+AuditLog when the version matches", async () => {
    const result = await completeTaskAction({ taskId: "task-1", expectedVersion: 1 });

    expect(result).toEqual({ success: true, version: 2 });
    expect(activityCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "TASK_COMPLETED" }) }),
    );
    expect(auditLogCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "TASK_COMPLETED" }) }),
    );
  });

  it("reopenTaskAction returns a controlled conflict when the version no longer matches", async () => {
    taskUpdateManyMock.mockResolvedValueOnce({ count: 0 });

    const result = await reopenTaskAction({ taskId: "task-1", expectedVersion: 1 });

    expect(result.success).toBe(false);
    expect(activityCreateMock).not.toHaveBeenCalled();
  });

  it("returns a 'not found' error for an already soft-deleted task, not a silent no-op", async () => {
    taskFindFirstMock.mockResolvedValueOnce(null);

    const result = await completeTaskAction({ taskId: "deleted-task", expectedVersion: 1 });

    expect(result).toEqual({ success: false, error: "Aufgabe wurde nicht gefunden." });
    expect(taskUpdateManyMock).not.toHaveBeenCalled();
  });
});
