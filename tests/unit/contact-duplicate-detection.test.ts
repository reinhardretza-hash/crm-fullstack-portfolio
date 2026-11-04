import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { contact: { findMany: (...args: unknown[]) => findManyMock(...args) } },
}));

const { checkContactDuplicates } = await import("@/modules/contacts/duplicate-detection");

beforeEach(() => {
  findManyMock.mockReset();
});

describe("checkContactDuplicates", () => {
  it("classifies a match by identical email as a strong 'email' match", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "k1",
        firstName: "Max",
        lastName: "Mustermann",
        emailNormalized: "max@example.com",
        linkedinNormalized: null,
        phoneNormalized: null,
      },
    ]);

    const matches = await checkContactDuplicates({ email: "Max@Example.com" });

    expect(matches[0].matchType).toBe("email");
  });

  it("classifies a match by identical normalized LinkedIn URL as a strong match", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "k2",
        firstName: "Max",
        lastName: "Mustermann",
        emailNormalized: null,
        linkedinNormalized: "https://linkedin.com/in/max-mustermann",
        phoneNormalized: null,
      },
    ]);

    const matches = await checkContactDuplicates({
      linkedinUrl: "https://www.linkedin.com/in/max-mustermann/",
    });

    expect(matches[0].matchType).toBe("linkedin");
  });

  it("classifies a match by identical normalized phone number as a strong match", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "k3",
        firstName: "Max",
        lastName: "Mustermann",
        emailNormalized: null,
        linkedinNormalized: null,
        phoneNormalized: "+12025550101",
      },
    ]);

    const matches = await checkContactDuplicates({ phone: "+1 202 555 0101" });

    expect(matches[0].matchType).toBe("phone");
  });

  it("falls back to the weaker 'name_company' match", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "k4",
        firstName: "Max",
        lastName: "Mustermann",
        emailNormalized: null,
        linkedinNormalized: null,
        phoneNormalized: null,
      },
    ]);

    const matches = await checkContactDuplicates({
      firstName: "Max",
      lastName: "Mustermann",
      companyId: "company-1",
    });

    expect(matches[0].matchType).toBe("name_company");
  });

  it("only ever queries non-deleted contacts", async () => {
    findManyMock.mockResolvedValueOnce([]);

    await checkContactDuplicates({ email: "max@example.com" });

    const whereArg = findManyMock.mock.calls[0][0].where;
    expect(whereArg.deletedAt).toBeNull();
  });
});
