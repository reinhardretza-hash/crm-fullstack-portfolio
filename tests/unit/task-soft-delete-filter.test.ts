import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn().mockResolvedValue([]);
const countMock = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: { task: { findMany: findManyMock, count: countMock } },
}));

const { listTasks } = await import("@/modules/tasks/queries");
const { taskFiltersSchema } = await import("@/validations/task");

beforeEach(() => {
  findManyMock.mockClear();
  countMock.mockClear();
});

describe("listTasks", () => {
  it("always filters out soft-deleted tasks, with no explicit filters set", async () => {
    await listTasks(taskFiltersSchema.parse({ view: "all" }), { page: 1, pageSize: 25 });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    const countWhere = countMock.mock.calls[0][0].where;
    expect(countWhere.deletedAt).toBeNull();
  });

  it("keeps the soft-delete filter even when other filters are applied", async () => {
    await listTasks(taskFiltersSchema.parse({ status: "OPEN", priority: "HIGH", view: "all" }), {
      page: 1,
      pageSize: 25,
    });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status).toBe("OPEN");
    expect(where.priority).toBe("HIGH");
  });

  it("the 'open' view excludes completed tasks", async () => {
    await listTasks(taskFiltersSchema.parse({ view: "open" }), { page: 1, pageSize: 25 });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "COMPLETED" });
  });

  it("the 'done' view only shows completed tasks", async () => {
    await listTasks(taskFiltersSchema.parse({ view: "done" }), { page: 1, pageSize: 25 });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.status).toBe("COMPLETED");
  });
});
