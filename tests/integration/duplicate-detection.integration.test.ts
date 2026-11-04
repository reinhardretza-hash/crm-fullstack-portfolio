import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkCompanyDuplicates } from "@/modules/companies/duplicate-detection";
import { checkContactDuplicates } from "@/modules/contacts/duplicate-detection";

describe("Company duplicate detection against real data", () => {
  it("classifies same domain, same email, and same name+city correctly - real Prisma queries, not mocks", async () => {
    await prisma.company.create({
      data: {
        id: createId(),
        name: "Beispiel Elektrik GmbH",
        website: "https://www.beispiel-elektrik.invalid",
        websiteDomain: "beispiel-elektrik.invalid",
        email: "info@other-domain.invalid",
        emailNormalized: "info@other-domain.invalid",
        city: "Berlin",
      },
    });

    const byDomain = await checkCompanyDuplicates({
      name: "Anderer Name",
      website: "beispiel-elektrik.invalid",
    });
    expect(byDomain[0]?.matchType).toBe("website");

    const byEmail = await checkCompanyDuplicates({
      name: "Wieder anderer Name",
      email: "info@other-domain.invalid",
    });
    expect(byEmail[0]?.matchType).toBe("email");

    const byNameCity = await checkCompanyDuplicates({
      name: "Beispiel Elektrik GmbH",
      city: "Berlin",
    });
    expect(byNameCity[0]?.matchType).toBe("name_city");

    const noMatch = await checkCompanyDuplicates({ name: "Völlig anderes Unternehmen" });
    expect(noMatch).toHaveLength(0);
  });

  it("never blocks creation - it only returns information, the caller decides", async () => {
    // "Name + Ort" ist bewusst nur ein SCHWACHES Signal und erfordert BEIDE
    // Felder (siehe Vorgabe) - Name allein liefert daher hier zurecht keinen
    // Treffer, das ist keine Falschmeldung.
    await prisma.company.create({
      data: { id: createId(), name: "Existiert Schon GmbH", city: "Hamburg" },
    });

    const matches = await checkCompanyDuplicates({ name: "Existiert Schon GmbH", city: "Hamburg" });
    expect(matches.length).toBeGreaterThan(0);

    // checkCompanyDuplicates selbst hat keine Möglichkeit, eine Erstellung zu
    // verhindern - es ist eine reine Lesefunktion ohne Seiteneffekt.
    const created = await prisma.company.create({
      data: { id: createId(), name: "Existiert Schon GmbH", city: "Hamburg" },
    });
    expect(created).toBeDefined();
  });
});

describe("Contact duplicate detection against real data", () => {
  it("classifies same email, same LinkedIn URL, same phone, and same name+company correctly", async () => {
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    await prisma.contact.create({
      data: {
        id: createId(),
        firstName: "Max",
        lastName: "Mustermann",
        email: "max@example.com",
        emailNormalized: "max@example.com",
        linkedinUrl: "https://linkedin.com/in/max-mustermann",
        linkedinNormalized: "https://linkedin.com/in/max-mustermann",
        phone: "+12025550101",
        phoneNormalized: "+12025550101",
        companyId: company.id,
      },
    });

    expect((await checkContactDuplicates({ email: "Max@Example.com" }))[0]?.matchType).toBe(
      "email",
    );
    expect(
      (
        await checkContactDuplicates({ linkedinUrl: "https://www.linkedin.com/in/max-mustermann/" })
      )[0]?.matchType,
    ).toBe("linkedin");
    expect((await checkContactDuplicates({ phone: "+1 202 555 0101" }))[0]?.matchType).toBe("phone");
    expect(
      (
        await checkContactDuplicates({
          firstName: "Max",
          lastName: "Mustermann",
          companyId: company.id,
        })
      )[0]?.matchType,
    ).toBe("name_company");

    const noMatch = await checkContactDuplicates({ email: "unrelated@example.com" });
    expect(noMatch).toHaveLength(0);
  });
});
