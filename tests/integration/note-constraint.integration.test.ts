import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createId } from "@paralleldrive/cuid2";

// Verifiziert die PostgreSQL-CHECK-Constraint "notes_exactly_one_target_check"
// direkt per Raw-SQL, um die Zod-Validierungsschicht bewusst zu umgehen -
// genau der Fall, den die Datenbank-Constraint zusätzlich absichern soll.
describe("notes_exactly_one_target_check (real PostgreSQL)", () => {
  async function makeUser() {
    return prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "irrelevant-for-this-test",
        firstName: "Test",
        lastName: "User",
      },
    });
  }

  it("rejects a note with NEITHER company_id NOR contact_id at the database level", async () => {
    const user = await makeUser();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, created_at, updated_at)
        VALUES (${createId()}, 'no target', ${user.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("rejects a note with BOTH company_id AND contact_id at the database level", async () => {
    const user = await makeUser();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const contact = await prisma.contact.create({ data: { id: createId(), firstName: "Max" } });

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, company_id, contact_id, created_at, updated_at)
        VALUES (${createId()}, 'both targets', ${user.id}, ${company.id}, ${contact.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("accepts a note with exactly a company_id", async () => {
    const user = await makeUser();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, company_id, created_at, updated_at)
        VALUES (${createId()}, 'company only', ${user.id}, ${company.id}, now(), now())`,
    ).resolves.toBeDefined();
  });

  it("accepts a note with exactly a contact_id", async () => {
    const user = await makeUser();
    const contact = await prisma.contact.create({ data: { id: createId(), firstName: "Max" } });

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, contact_id, created_at, updated_at)
        VALUES (${createId()}, 'contact only', ${user.id}, ${contact.id}, now(), now())`,
    ).resolves.toBeDefined();
  });

  async function makeLead() {
    const pipeline = await prisma.pipeline.create({
      data: {
        id: createId(),
        name: "Testpipeline",
        stages: { create: [{ id: createId(), name: "Stufe 1", position: 1 }] },
      },
      include: { stages: true },
    });
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    return prisma.lead.create({
      data: {
        id: createId(),
        title: "Testlead",
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
      },
    });
  }

  it("accepts a note with exactly a lead_id (3-way XOR, erweitert um Lead)", async () => {
    const user = await makeUser();
    const lead = await makeLead();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, lead_id, created_at, updated_at)
        VALUES (${createId()}, 'lead only', ${user.id}, ${lead.id}, now(), now())`,
    ).resolves.toBeDefined();
  });

  it("rejects a note with BOTH company_id AND lead_id", async () => {
    const user = await makeUser();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const lead = await makeLead();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, company_id, lead_id, created_at, updated_at)
        VALUES (${createId()}, 'company and lead', ${user.id}, ${company.id}, ${lead.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("rejects a note with BOTH contact_id AND lead_id", async () => {
    const user = await makeUser();
    const contact = await prisma.contact.create({ data: { id: createId(), firstName: "Max" } });
    const lead = await makeLead();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, contact_id, lead_id, created_at, updated_at)
        VALUES (${createId()}, 'contact and lead', ${user.id}, ${contact.id}, ${lead.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("rejects a note with ALL THREE (company/contact/lead) targets set", async () => {
    const user = await makeUser();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const contact = await prisma.contact.create({ data: { id: createId(), firstName: "Max" } });
    const lead = await makeLead();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, company_id, contact_id, lead_id, created_at, updated_at)
        VALUES (${createId()}, 'all three', ${user.id}, ${company.id}, ${contact.id}, ${lead.id}, now(), now())`,
    ).rejects.toThrow();
  });

  async function makeDeal() {
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    return prisma.deal.create({
      data: {
        id: createId(),
        name: "Testdeal",
        companyId: company.id,
        service: "WEBSITE",
        valueCents: 1000,
      },
    });
  }

  it("accepts a note with exactly a deal_id (4-way XOR, erweitert um Deal)", async () => {
    const user = await makeUser();
    const deal = await makeDeal();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, deal_id, created_at, updated_at)
        VALUES (${createId()}, 'deal only', ${user.id}, ${deal.id}, now(), now())`,
    ).resolves.toBeDefined();
  });

  it("rejects a note with BOTH company_id AND deal_id", async () => {
    const user = await makeUser();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const deal = await makeDeal();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, company_id, deal_id, created_at, updated_at)
        VALUES (${createId()}, 'company and deal', ${user.id}, ${company.id}, ${deal.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("rejects a note with BOTH lead_id AND deal_id", async () => {
    const user = await makeUser();
    const lead = await makeLead();
    const deal = await makeDeal();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, lead_id, deal_id, created_at, updated_at)
        VALUES (${createId()}, 'lead and deal', ${user.id}, ${lead.id}, ${deal.id}, now(), now())`,
    ).rejects.toThrow();
  });

  it("rejects a note with ALL FOUR targets set", async () => {
    const user = await makeUser();
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const contact = await prisma.contact.create({ data: { id: createId(), firstName: "Max" } });
    const lead = await makeLead();
    const deal = await makeDeal();

    await expect(
      prisma.$executeRaw`INSERT INTO notes (id, content, author_id, company_id, contact_id, lead_id, deal_id, created_at, updated_at)
        VALUES (${createId()}, 'all four', ${user.id}, ${company.id}, ${contact.id}, ${lead.id}, ${deal.id}, now(), now())`,
    ).rejects.toThrow();
  });
});
