import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkContactDuplicates } from "@/modules/contacts/duplicate-detection";
import { getCompanyById, listCompanies } from "@/modules/companies/queries";
import { getContactById, listContacts } from "@/modules/contacts/queries";
import { companyFiltersSchema } from "@/validations/company";
import { contactFiltersSchema } from "@/validations/contact";

describe("Company soft delete (real PostgreSQL)", () => {
  it("sets deletedAt, keeps the row physically, hides it from list/detail, and does not touch its contacts", async () => {
    const company = await prisma.company.create({
      data: { id: createId(), name: "Wird gelöscht GmbH" },
    });
    const contact = await prisma.contact.create({
      data: { id: createId(), firstName: "Bleibt", lastName: "Bestehen", companyId: company.id },
    });

    await prisma.company.update({ where: { id: company.id }, data: { deletedAt: new Date() } });

    // Physisch weiterhin vorhanden.
    const raw = await prisma.company.findUnique({ where: { id: company.id } });
    expect(raw).not.toBeNull();
    expect(raw?.deletedAt).not.toBeNull();

    // Normale Liste zeigt es nicht.
    const { companies } = await listCompanies(companyFiltersSchema.parse({}), {
      page: 1,
      pageSize: 25,
    });
    expect(companies.find((c) => c.id === company.id)).toBeUndefined();

    // Detailquery behandelt es als nicht vorhanden.
    const detail = await getCompanyById(company.id);
    expect(detail).toBeNull();

    // Der zugehörige Kontakt wird NICHT gelöscht und behält seine companyId -
    // onDelete: SetNull greift nur bei einem physischen DELETE, nicht bei
    // unserem Soft Delete (UPDATE deletedAt), daher bewusst unverändert.
    const stillLinkedContact = await prisma.contact.findUnique({ where: { id: contact.id } });
    expect(stillLinkedContact?.deletedAt).toBeNull();
    expect(stillLinkedContact?.companyId).toBe(company.id);
  });
});

describe("Contact soft delete (real PostgreSQL)", () => {
  it("sets deletedAt, keeps the row physically, and hides it from list/detail", async () => {
    const contact = await prisma.contact.create({
      data: { id: createId(), firstName: "Wird gelöscht" },
    });

    await prisma.contact.update({ where: { id: contact.id }, data: { deletedAt: new Date() } });

    const raw = await prisma.contact.findUnique({ where: { id: contact.id } });
    expect(raw).not.toBeNull();
    expect(raw?.deletedAt).not.toBeNull();

    const { contacts } = await listContacts(contactFiltersSchema.parse({}), {
      page: 1,
      pageSize: 25,
    });
    expect(contacts.find((c) => c.id === contact.id)).toBeUndefined();

    const detail = await getContactById(contact.id);
    expect(detail).toBeNull();
  });
});

describe("Soft delete and 'unique' normalized data (deliberate design decision)", () => {
  it("allows the same email to be reused by a new contact after the old one was soft-deleted", async () => {
    // Bewusste Entscheidung: Company/Contact haben KEINE Datenbank-Unique-
    // Constraint auf E-Mail/Website/LinkedIn (anders als z. B. User.email) -
    // die Duplikaterkennung ist laut Vorgabe rein beratend ("nicht
    // automatisch blockieren"), nie technisch erzwingend. Ein Soft Delete
    // "gibt" die E-Mail-Adresse daher automatisch wieder frei, ohne dass
    // dafür ein Constraint gelockert werden müsste.
    const original = await prisma.contact.create({
      data: {
        id: createId(),
        firstName: "Alt",
        email: "test@example.invalid",
        emailNormalized: "test@example.invalid",
      },
    });
    await prisma.contact.update({ where: { id: original.id }, data: { deletedAt: new Date() } });

    const recreated = await prisma.contact.create({
      data: {
        id: createId(),
        firstName: "Neu",
        email: "test@example.invalid",
        emailNormalized: "test@example.invalid",
      },
    });
    expect(recreated.id).not.toBe(original.id);

    // Bewusste Entscheidung: Die Duplikaterkennung schließt soft-gelöschte
    // Datensätze aus (`deletedAt: null` in checkContactDuplicates) - ein neuer
    // Kontakt mit derselben E-Mail wie ein bewusst entfernter alter Datensatz
    // wird NICHT als Duplikat des gelöschten Datensatzes gemeldet.
    const matches = await checkContactDuplicates({
      email: "test@example.invalid",
      excludeId: recreated.id,
    });
    expect(matches).toHaveLength(0);
  });
});
