import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { company: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));

const { checkCompanyDuplicates } = await import("@/modules/companies/duplicate-detection");

beforeEach(() => {
  findManyMock.mockReset();
});

describe("checkCompanyDuplicates", () => {
  it("classifies a match by identical website domain as a strong 'website' match", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "c1",
        name: "Acme GmbH",
        city: "Berlin",
        websiteDomain: "acme.invalid",
        emailNormalized: null,
      },
    ]);

    const matches = await checkCompanyDuplicates({ name: "Acme", website: "https://www.acme.invalid" });

    expect(matches).toEqual([
      { id: "c1", name: "Acme GmbH", city: "Berlin", matchType: "website" },
    ]);
  });

  it("classifies a match by identical email as a strong 'email' match", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "c2",
        name: "Acme GmbH",
        city: "Berlin",
        websiteDomain: null,
        emailNormalized: "info@acme.invalid",
      },
    ]);

    const matches = await checkCompanyDuplicates({ name: "Acme", email: "Info@acme.invalid" });

    expect(matches[0].matchType).toBe("email");
  });

  it("falls back to the weaker 'name_city' match when neither website nor email match", async () => {
    findManyMock.mockResolvedValueOnce([
      { id: "c3", name: "Acme GmbH", city: "Berlin", websiteDomain: null, emailNormalized: null },
    ]);

    const matches = await checkCompanyDuplicates({ name: "Acme GmbH", city: "Berlin" });

    expect(matches[0].matchType).toBe("name_city");
  });

  it("excludes the given excludeId from duplicate candidates (for edit forms)", async () => {
    findManyMock.mockResolvedValueOnce([]);

    await checkCompanyDuplicates({ name: "Acme", excludeId: "self-id" });

    const whereArg = findManyMock.mock.calls[0][0].where;
    expect(whereArg.id).toEqual({ not: "self-id" });
  });

  it("only ever queries non-deleted companies", async () => {
    findManyMock.mockResolvedValueOnce([]);

    await checkCompanyDuplicates({ name: "Acme" });

    const whereArg = findManyMock.mock.calls[0][0].where;
    expect(whereArg.deletedAt).toBeNull();
  });
});
