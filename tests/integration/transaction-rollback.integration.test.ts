import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createId } from "@paralleldrive/cuid2";

let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

// Erzwingt kontrolliert einen Fehler NACH dem Anlegen der Hauptentität, aber
// VOR Activity/AuditLog - simuliert z. B. einen Bug oder eine kurzzeitige
// Störung in genau diesem Codepfad.
vi.mock("@/modules/activity/log", () => ({
  logActivity: vi
    .fn()
    .mockRejectedValue(new Error("simulated failure between entity creation and Activity")),
}));

const { createCompanyAction } = await import("@/modules/companies/actions");
const { createContactAction } = await import("@/modules/contacts/actions");

function formData(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) data.append(key, v);
    } else {
      data.set(key, value);
    }
  }
  return data;
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
});

describe("Transaction rollback on a mid-transaction failure (real PostgreSQL)", () => {
  it("leaves no company, no tags/needs join rows, no Activity and no AuditLog behind", async () => {
    const result = await createCompanyAction(
      { error: null },
      formData({ name: "Rollback GmbH", needs: ["WEBSITE"], tags: ["RollbackTag"] }),
    );

    expect(result.error).toBe("Unternehmen konnte nicht gespeichert werden.");

    const company = await prisma.company.findFirst({ where: { name: "Rollback GmbH" } });
    expect(company).toBeNull();

    // Der Tag selbst wird innerhalb derselben Transaktion angelegt wie die
    // Company - schlägt die Transaktion fehl, darf auch der Tag nicht
    // übrig bleiben.
    const tag = await prisma.tag.findUnique({ where: { normalizedName: "rollbacktag" } });
    expect(tag).toBeNull();

    const activity = await prisma.activity.findFirst({});
    expect(activity).toBeNull();

    const auditLog = await prisma.auditLog.findFirst({});
    expect(auditLog).toBeNull();
  });

  it("also rolls back a failed contact creation completely", async () => {
    const result = await createContactAction(
      { error: null },
      formData({ firstName: "Rollback", tags: ["X"] }),
    );

    expect(result.error).toBe("Kontakt konnte nicht gespeichert werden.");

    const contact = await prisma.contact.findFirst({ where: { firstName: "Rollback" } });
    expect(contact).toBeNull();
    const tag = await prisma.tag.findUnique({ where: { normalizedName: "x" } });
    expect(tag).toBeNull();
  });
});
