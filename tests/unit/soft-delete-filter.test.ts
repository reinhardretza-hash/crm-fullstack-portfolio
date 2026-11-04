import { beforeEach, describe, expect, it, vi } from "vitest";

const companyFindManyMock = vi.fn().mockResolvedValue([]);
const companyCountMock = vi.fn().mockResolvedValue(0);
const contactFindManyMock = vi.fn().mockResolvedValue([]);
const contactCountMock = vi.fn().mockResolvedValue(0);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findMany: companyFindManyMock, count: companyCountMock },
    contact: { findMany: contactFindManyMock, count: contactCountMock },
  },
}));

const { listCompanies } = await import("@/modules/companies/queries");
const { listContacts } = await import("@/modules/contacts/queries");
const { companyFiltersSchema } = await import("@/validations/company");
const { contactFiltersSchema } = await import("@/validations/contact");

beforeEach(() => {
  companyFindManyMock.mockClear();
  companyCountMock.mockClear();
  contactFindManyMock.mockClear();
  contactCountMock.mockClear();
});

describe("listCompanies", () => {
  it("always filters out soft-deleted companies, with no explicit filters set", async () => {
    await listCompanies(companyFiltersSchema.parse({}), { page: 1, pageSize: 25 });

    const where = companyFindManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    const countWhere = companyCountMock.mock.calls[0][0].where;
    expect(countWhere.deletedAt).toBeNull();
  });

  it("keeps the soft-delete filter even when other filters are applied", async () => {
    await listCompanies(companyFiltersSchema.parse({ status: "PROSPECT", q: "acme" }), {
      page: 1,
      pageSize: 25,
    });

    const where = companyFindManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.status).toBe("PROSPECT");
  });
});

describe("listContacts", () => {
  it("always filters out soft-deleted contacts", async () => {
    await listContacts(contactFiltersSchema.parse({}), { page: 1, pageSize: 25 });

    const where = contactFindManyMock.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
    const countWhere = contactCountMock.mock.calls[0][0].where;
    expect(countWhere.deletedAt).toBeNull();
  });
});
