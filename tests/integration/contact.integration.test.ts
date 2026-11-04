import { createId } from "@paralleldrive/cuid2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

let testUser: { id: string };

vi.mock("@/server/rbac", () => ({
  requireUser: async () => testUser,
}));

const { createContactAction, updateContactAction } = await import("@/modules/contacts/actions");

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

describe("Contact creation (real PostgreSQL transaction)", () => {
  it("creates a contact with a company relation, tags and an assigned user", async () => {
    const company = await prisma.company.create({ data: { id: createId(), name: "Acme GmbH" } });
    const assignedUser = await prisma.user.create({
      data: {
        id: createId(),
        email: `${createId()}@example.com`,
        passwordHash: "irrelevant",
        firstName: "Verant",
        lastName: "Wortlich",
      },
    });

    try {
      await createContactAction(
        { error: null },
        formData({
          firstName: "Max",
          lastName: "Mustermann",
          companyId: company.id,
          email: "max@example.com",
          phone: "+1 202 555 0101",
          linkedinUrl: "linkedin.com/in/max-mustermann",
          tags: ["Geschäftsführer"],
          assignedUserId: assignedUser.id,
        }),
      );
    } catch {
      // redirect - ignore
    }

    const contact = await prisma.contact.findFirstOrThrow({
      where: { email: "max@example.com" },
      include: { tags: { include: { tag: true } } },
    });

    expect(contact.companyId).toBe(company.id);
    expect(contact.assignedUserId).toBe(assignedUser.id);
    expect(contact.emailNormalized).toBe("max@example.com");
    expect(contact.phoneNormalized).toBe("+12025550101");
    expect(contact.linkedinNormalized).toBe("https://linkedin.com/in/max-mustermann");
    expect(contact.tags.map((t) => t.tag.name)).toEqual(["Geschäftsführer"]);

    const activity = await prisma.activity.findFirst({ where: { contactId: contact.id } });
    expect(activity?.type).toBe("CONTACT_CREATED");

    const auditLog = await prisma.auditLog.findFirst({ where: { entityId: contact.id } });
    expect(auditLog?.action).toBe("CONTACT_CREATED");
  });
});

describe("Contact editing (real PostgreSQL transaction)", () => {
  it("updates fields and replaces tags consistently", async () => {
    try {
      await createContactAction({ error: null }, formData({ firstName: "Erika", tags: ["Alt"] }));
    } catch {
      // redirect - ignore
    }
    const created = await prisma.contact.findFirstOrThrow({ where: { firstName: "Erika" } });

    try {
      await updateContactAction(
        created.id,
        { error: null },
        formData({ firstName: "Erika", lastName: "Musterfrau", tags: ["Neu"] }),
      );
    } catch {
      // redirect - ignore
    }

    const updated = await prisma.contact.findUniqueOrThrow({
      where: { id: created.id },
      include: { tags: { include: { tag: true } } },
    });

    expect(updated.lastName).toBe("Musterfrau");
    expect(updated.tags.map((t) => t.tag.name)).toEqual(["Neu"]);

    const activities = await prisma.activity.findMany({
      where: { contactId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(activities.map((a) => a.type)).toEqual(["CONTACT_CREATED", "CONTACT_UPDATED"]);
  });
});
