import { beforeEach, describe, expect, it, vi } from "vitest";

// Regressionstest für einen über die echte PostgreSQL-Integrationstest-Suite
// gefundenen Fehler (Schritt 4): `FormData.get()` liefert `null` für Felder,
// die im FormData-Objekt gar nicht vorkommen. Unsere Zod-Schemas akzeptieren
// dafür aber nur `string | undefined`, nie `null` - eine sparse FormData
// (nur die Pflichtfelder gesetzt) schlug daher fälschlich mit einem
// Validierungsfehler fehl, obwohl alle weggelassenen Felder optional sind.
// Durch das eigene Rendering unserer Formulare (jedes Feld wird immer mit
// einem Namen gerendert) war das über die UI nicht erreichbar, aber die
// Server Actions sollten sich nicht auf dieses Detail verlassen müssen.

const requireUserMock = vi.fn().mockResolvedValue({ id: "user-1" });
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

const { createCompanyAction } = await import("@/modules/companies/actions");
const { createContactAction } = await import("@/modules/contacts/actions");

beforeEach(() => {
  transactionMock.mockReset();
  transactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      tag: { upsert: vi.fn().mockResolvedValue({ id: "tag-1" }) },
      company: { create: vi.fn().mockResolvedValue({ id: "company-1" }) },
      contact: { create: vi.fn().mockResolvedValue({ id: "contact-1" }) },
      activity: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    }),
  );
});

describe("createCompanyAction with a sparse FormData (only the required field set)", () => {
  it("does not fail validation just because optional fields are entirely absent from FormData", async () => {
    const formData = new FormData();
    formData.set("name", "Acme GmbH");
    // Bewusst: website/industry/phone/email/... werden NICHT gesetzt -
    // formData.get(...) liefert dafür `null`, nicht `undefined` oder `""`.

    await expect(createCompanyAction({ error: null }, formData)).rejects.toThrow("REDIRECT:");
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});

describe("createContactAction with a sparse FormData (only firstName set)", () => {
  it("does not fail validation just because optional fields are entirely absent from FormData", async () => {
    const formData = new FormData();
    formData.set("firstName", "Max");

    await expect(createContactAction({ error: null }, formData)).rejects.toThrow("REDIRECT:");
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
