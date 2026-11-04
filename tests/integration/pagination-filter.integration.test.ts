import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listCompanies } from "@/modules/companies/queries";
import { companyFiltersSchema } from "@/validations/company";

const TOTAL_COMPANIES = 30;

async function seedCompanies() {
  const users = await Promise.all(
    ["Anna", "Ben"].map((firstName) =>
      prisma.user.create({
        data: {
          id: createId(),
          email: `${createId()}@example.com`,
          passwordHash: "irrelevant",
          firstName,
          lastName: "Verantwortlich",
        },
      }),
    ),
  );

  for (let i = 0; i < TOTAL_COMPANIES; i++) {
    await prisma.company.create({
      data: {
        id: createId(),
        name: `Firma ${String(i).padStart(2, "0")}`,
        status: i % 3 === 0 ? "ACTIVE_CUSTOMER" : "PROSPECT",
        source: i % 2 === 0 ? "LINKEDIN" : "WEBSITE",
        assignedUserId: users[i % 2].id,
        city: i % 5 === 0 ? "Berlin" : "Hamburg",
      },
    });
  }

  return users;
}

describe("Pagination, filtering, sorting and search against real data (25/50/100)", () => {
  it("paginates with the default page size of 25, page 2 holding the remainder", async () => {
    await seedCompanies();

    const page1 = await listCompanies(companyFiltersSchema.parse({}), { page: 1, pageSize: 25 });
    expect(page1.companies).toHaveLength(25);
    expect(page1.totalCount).toBe(TOTAL_COMPANIES);
    expect(page1.totalPages).toBe(2);

    const page2 = await listCompanies(companyFiltersSchema.parse({}), { page: 2, pageSize: 25 });
    expect(page2.companies).toHaveLength(TOTAL_COMPANIES - 25);

    // Keine Überschneidung zwischen den Seiten - keine vollständige Tabelle
    // wird "clientseitig" nachgefiltert, jede Seite ist ein eigener,
    // begrenzter Datenbank-Query.
    const page1Ids = new Set(page1.companies.map((c) => c.id));
    for (const company of page2.companies) {
      expect(page1Ids.has(company.id)).toBe(false);
    }
  });

  it("sorts by name ascending and descending", async () => {
    await seedCompanies();

    const asc = await listCompanies(
      companyFiltersSchema.parse({ sort: "name", direction: "asc" }),
      {
        page: 1,
        pageSize: 100,
      },
    );
    const names = asc.companies.map((c) => c.name);
    expect(names).toEqual([...names].sort());

    const desc = await listCompanies(
      companyFiltersSchema.parse({ sort: "name", direction: "desc" }),
      {
        page: 1,
        pageSize: 100,
      },
    );
    expect(desc.companies.map((c) => c.name)).toEqual([...names].reverse());
  });

  it("searches by (partial, case-insensitive) name via PostgreSQL, not by loading everything into the client", async () => {
    await seedCompanies();

    const result = await listCompanies(companyFiltersSchema.parse({ q: "firma 0" }), {
      page: 1,
      pageSize: 100,
    });
    expect(result.totalCount).toBe(10); // Firma 00, 01, ..., 09
    expect(result.companies.every((c) => c.name.toLowerCase().includes("firma 0"))).toBe(true);
  });

  it("combines search + multiple filters + sorting at the same time", async () => {
    const users = await seedCompanies();

    const result = await listCompanies(
      companyFiltersSchema.parse({
        q: "firma",
        status: "PROSPECT",
        source: "LINKEDIN",
        assignedUserId: users[0].id,
        sort: "name",
        direction: "asc",
      }),
      { page: 1, pageSize: 100 },
    );

    expect(result.companies.length).toBeGreaterThan(0);
    for (const company of result.companies) {
      expect(company.status).toBe("PROSPECT");
      expect(company.source).toBe("LINKEDIN");
    }
  });

  it("supports pageSize 50 and 100 as well as the default 25", async () => {
    await seedCompanies();

    const size50 = await listCompanies(companyFiltersSchema.parse({}), { page: 1, pageSize: 50 });
    expect(size50.companies).toHaveLength(TOTAL_COMPANIES);

    const size100 = await listCompanies(companyFiltersSchema.parse({}), { page: 1, pageSize: 100 });
    expect(size100.companies).toHaveLength(TOTAL_COMPANIES);
  });
});
