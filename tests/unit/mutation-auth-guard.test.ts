import { beforeEach, describe, expect, it, vi } from "vitest";

// Simuliert exakt das reale Verhalten von requireUser(): bei fehlender
// Session wird redirect() aufgerufen, was in Next.js einen speziellen
// Kontrollfluss-Fehler wirft (hier als Marker-Error nachgebildet).
const requireUserMock = vi.fn();
const transactionMock = vi.fn();
const findFirstMock = vi.fn();

vi.mock("@/server/rbac", () => ({
  requireUser: () => requireUserMock(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
    company: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
    contact: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { createCompanyAction, updateCompanyAction, deleteCompanyAction } =
  await import("@/modules/companies/actions");
const { createContactAction, updateContactAction, deleteContactAction } =
  await import("@/modules/contacts/actions");

function unauthenticated() {
  requireUserMock.mockImplementation(() => {
    throw new Error("REDIRECT:/login");
  });
}

beforeEach(() => {
  requireUserMock.mockReset();
  transactionMock.mockReset();
  findFirstMock.mockReset();
});

describe("Company mutations require an authenticated, active user", () => {
  it("createCompanyAction never writes to the database when unauthenticated", async () => {
    unauthenticated();
    const formData = new FormData();
    formData.set("name", "Acme GmbH");

    await expect(createCompanyAction({ error: null }, formData)).rejects.toThrow("REDIRECT:/login");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updateCompanyAction never reads or writes when unauthenticated", async () => {
    unauthenticated();
    const formData = new FormData();
    formData.set("name", "Acme GmbH");

    await expect(updateCompanyAction("company-1", { error: null }, formData)).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("deleteCompanyAction never writes when unauthenticated", async () => {
    unauthenticated();

    await expect(deleteCompanyAction("company-1")).rejects.toThrow("REDIRECT:/login");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe("Contact mutations require an authenticated, active user", () => {
  it("createContactAction never writes to the database when unauthenticated", async () => {
    unauthenticated();
    const formData = new FormData();
    formData.set("firstName", "Max");

    await expect(createContactAction({ error: null }, formData)).rejects.toThrow("REDIRECT:/login");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("updateContactAction never reads or writes when unauthenticated", async () => {
    unauthenticated();
    const formData = new FormData();
    formData.set("firstName", "Max");

    await expect(updateContactAction("contact-1", { error: null }, formData)).rejects.toThrow(
      "REDIRECT:/login",
    );
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("deleteContactAction never writes when unauthenticated", async () => {
    unauthenticated();

    await expect(deleteContactAction("contact-1")).rejects.toThrow("REDIRECT:/login");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
