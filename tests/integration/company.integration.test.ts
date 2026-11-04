import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

// requireUser() braucht einen echten Next.js-Request-/Cookie-Kontext (auth()),
// den es außerhalb eines laufenden Servers nicht gibt. Für diese
// Integrationstests wird ausschließlich die Auth-Schicht durch einen
// realen, in der Testdatenbank existierenden Benutzer ersetzt - die
// eigentliche Transaktions-/Datenbank-Logik in den Server Actions läuft
// vollständig echt gegen PostgreSQL.
let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

const { createCompanyAction, updateCompanyAction } = await import("@/modules/companies/actions");

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

describe("Company creation (real PostgreSQL transaction)", () => {
  it("creates a company with stammdaten, needs, tags and an assigned user in one consistent transaction", async () => {
    const assignedUser = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "irrelevant",
        firstName: "Verant",
        lastName: "Wortlich",
      },
    });

    let redirectedTo: string | undefined;
    try {
      await createCompanyAction(
        { error: null },
        formData({
          name: "Müller Elektrotechnik GmbH",
          city: "Berlin",
          needs: ["WEBSITE", "SEO"],
          tags: ["Handwerk", "Interessant"],
          assignedUserId: assignedUser.id,
        }),
      );
    } catch (error) {
      // redirect() wirft in Next.js einen Kontrollfluss-Fehler mit der Ziel-URL.
      redirectedTo = (error as { digest?: string })?.digest ?? String(error);
    }

    const company = await prisma.company.findFirstOrThrow({
      where: { name: "Müller Elektrotechnik GmbH" },
      include: { needs: true, tags: { include: { tag: true } } },
    });

    expect(company.city).toBe("Berlin");
    expect(company.assignedUserId).toBe(assignedUser.id);
    expect(company.needs.map((n) => n.need).sort()).toEqual(["SEO", "WEBSITE"]);
    expect(company.tags.map((t) => t.tag.normalizedName).sort()).toEqual([
      "handwerk",
      "interessant",
    ]);
    expect(redirectedTo).toBeDefined();

    const activity = await prisma.activity.findFirst({ where: { companyId: company.id } });
    expect(activity?.type).toBe("COMPANY_CREATED");
    expect(activity?.userId).toBe(testUser.id);

    const auditLog = await prisma.auditLog.findFirst({ where: { entityId: company.id } });
    expect(auditLog?.action).toBe("COMPANY_CREATED");
  });
});

describe("Company editing (real PostgreSQL transaction)", () => {
  it("consistently replaces tags and needs, and updates the name", async () => {
    let companyId = "";
    try {
      await createCompanyAction(
        { error: null },
        formData({ name: "Alte GmbH", needs: ["WEBSITE"], tags: ["Alt"] }),
      );
    } catch {
      // redirect - ignore
    }
    const created = await prisma.company.findFirstOrThrow({ where: { name: "Alte GmbH" } });
    companyId = created.id;

    try {
      await updateCompanyAction(
        companyId,
        { error: null },
        formData({ name: "Neue GmbH", needs: ["SEO", "CONSULTING"], tags: ["Neu"] }),
      );
    } catch {
      // redirect - ignore
    }

    const updated = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { needs: true, tags: { include: { tag: true } } },
    });

    expect(updated.name).toBe("Neue GmbH");
    expect(updated.needs.map((n) => n.need).sort()).toEqual(["CONSULTING", "SEO"]);
    expect(updated.tags.map((t) => t.tag.name)).toEqual(["Neu"]);

    // Der alte Tag "Alt" bleibt als eigenständiger Tag-Datensatz bestehen
    // (Tags werden nur entkoppelt, nicht gelöscht) - nur die Zuordnung ändert sich.
    const oldTagStillExists = await prisma.tag.findUnique({ where: { normalizedName: "alt" } });
    expect(oldTagStillExists).not.toBeNull();

    const activities = await prisma.activity.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
    expect(activities.map((a) => a.type)).toEqual(["COMPANY_CREATED", "COMPANY_UPDATED"]);
  });
});
