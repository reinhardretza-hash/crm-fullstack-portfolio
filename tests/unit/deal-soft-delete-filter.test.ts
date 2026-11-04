import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn().mockResolvedValue([]);
const countMock = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: { deal: { findMany: findManyMock, count: countMock } },
}));

const { listDeals } = await import("@/modules/deals/queries");
const { dealFiltersSchema } = await import("@/validations/deal");

beforeEach(() => {
  findManyMock.mockClear();
  countMock.mockClear();
});

describe("listDeals", () => {
  it("always filters out soft-deleted deals, with no explicit filters set", async () => {
    await listDeals(dealFiltersSchema.parse({}), { page: 1, pageSize: 25 });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    const countWhere = countMock.mock.calls[0][0].where;
    expect(countWhere.deletedAt).toBeNull();
  });

  it("keeps the soft-delete filter even when other filters are applied", async () => {
    await listDeals(dealFiltersSchema.parse({ status: "OPEN", service: "WEBSITE" }), {
      page: 1,
      pageSize: 25,
    });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status).toBe("OPEN");
    expect(where.service).toBe("WEBSITE");
  });

  it("filters by a value range when provided", async () => {
    await listDeals(dealFiltersSchema.parse({ valueMinCents: "1000", valueMaxCents: "5000" }), {
      page: 1,
      pageSize: 25,
    });

    const where = findManyMock.mock.calls[0][0].where;
    expect(where.valueCents).toEqual({ gte: 1000, lte: 5000 });
  });
});
