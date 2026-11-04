import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn().mockResolvedValue([]);
const countMock = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: { lead: { findMany: findManyMock, count: countMock } },
}));

const { listLeads } = await import("@/modules/leads/queries");
const { leadFiltersSchema } = await import("@/validations/lead");

beforeEach(() => {
  findManyMock.mockClear();
  countMock.mockClear();
});

describe("listLeads", () => {
  it("always filters out soft-deleted leads, with no explicit filters set", async () => {
    await listLeads(leadFiltersSchema.parse({}), { page: 1, pageSize: 25 });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    const countWhere = countMock.mock.calls[0][0].where;
    expect(countWhere.deletedAt).toBeNull();
  });

  it("keeps the soft-delete filter even when other filters are applied", async () => {
    await listLeads(leadFiltersSchema.parse({ status: "OPEN", priority: "HIGH" }), {
      page: 1,
      pageSize: 25,
    });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status).toBe("OPEN");
    expect(where.priority).toBe("HIGH");
  });

  it("filters by overdue follow-up when requested", async () => {
    await listLeads(leadFiltersSchema.parse({ overdue: "true" }), { page: 1, pageSize: 25 });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.nextFollowUpAt).toEqual({ lt: expect.any(Date) });
  });
});
