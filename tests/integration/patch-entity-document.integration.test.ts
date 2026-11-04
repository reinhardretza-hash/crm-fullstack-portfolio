import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));
let authenticated = true;
vi.mock("@/server/rbac", () => ({
  requireUser: async () => {
    if (!authenticated) throw new Error("AUTH_REQUIRED");
    return prisma.user.findUniqueOrThrow({ where: { id: "patch-user" } });
  },
}));
vi.mock("@/modules/email/smtp", () => ({ isSmtpConfigured: () => false }));
import { deleteCompanyFromDetailAction } from "@/modules/companies/actions";
import { deleteContactFromDetailAction } from "@/modules/contacts/actions";
import { listCompanies, listCompanyOptions } from "@/modules/companies/queries";
import { listContacts, listContactOptions } from "@/modules/contacts/queries";
import { companyFiltersSchema } from "@/validations/company";
import { contactFiltersSchema } from "@/validations/contact";
import { saveQuote, changeQuote } from "@/modules/quotes/service";
import { getQuote, quoteFormOptions } from "@/modules/quotes/queries";
import { saveInvoice, changeInvoice } from "@/modules/invoices/service";
import { getInvoice } from "@/modules/invoices/queries";
import { calendarFormOptions } from "@/modules/calendar/queries";
import { resolveEmailContext } from "@/modules/email/context";
import ComposePage from "@/app/(dashboard)/emails/new/page";

const input = {
  companyId: "patch-company",
  contactId: "patch-contact",
  assignedUserId: "patch-user",
  issueDate: "2026-10-02",
  validUntil: "2199-12-31",
  dueDate: "2199-12-31",
  taxRateBasisPoints: 1900,
  items: [
    {
      title: "Testleistung",
      quantity: "1",
      unit: "Stück",
      unitPrice: "100",
      taxRateBasisPoints: "1900",
    },
  ],
};
beforeEach(async () => {
  authenticated = true;
  await prisma.user.create({
    data: {
      id: "patch-user",
      email: "patch@example.invalid",
      passwordHash: "unusable",
      firstName: "Patch",
      lastName: "Test",
      role: "OWNER",
    },
  });
  await prisma.company.create({
    data: {
      id: "patch-company",
      name: "Patch Test GmbH",
      street: "Teststraße 1",
      postalCode: "12345",
      city: "Teststadt",
    },
  });
  await prisma.contact.create({
    data: {
      id: "patch-contact",
      firstName: "Test",
      lastName: "Kontakt",
      email: "recipient@example.invalid",
      companyId: "patch-company",
    },
  });
});

it.each(["company", "contact"] as const)(
  "detail %s deletion keeps document, activity, note and email history while hiding normal selectors",
  async (kind) => {
    const quote = await saveQuote("patch-user", input);
    const invoice = await saveInvoice("patch-user", input);
    const note = await prisma.note.create({
      data: {
        content: "Synthetic history",
        authorId: "patch-user",
        ...(kind === "company" ? { companyId: "patch-company" } : { contactId: "patch-contact" }),
      },
    });
    const activities = await prisma.activity.count();
    const email = await prisma.emailMessage.create({
      data: {
        status: "SENT",
        idempotencyKey: "patch-history-email",
        requestHash: "a".repeat(64),
        fromEmail: "sender@example.invalid",
        toEmail: "recipient@example.invalid",
        subject: "Synthetic history",
        textBody: "History",
        sentByUserId: "patch-user",
        sentAt: new Date(),
        companyId: "patch-company",
        contactId: "patch-contact",
        quoteId: quote.id,
        quoteVersion: quote.version,
      },
    });
    const remove =
      kind === "company" ? deleteCompanyFromDetailAction : deleteContactFromDetailAction;
    const id = `patch-${kind}`;
    await expect(remove(id)).rejects.toThrow(
      `REDIRECT:/${kind === "company" ? "companies" : "contacts"}?deleted=1`,
    );
    expect((await remove(id)).error).toContain("bereits gelöscht");
    expect(
      await prisma.auditLog.count({
        where: { action: kind === "company" ? "COMPANY_DELETED" : "CONTACT_DELETED", entityId: id },
      }),
    ).toBe(1);
    const historicalQuote = await getQuote(quote.id),
      historicalInvoice = await getInvoice(invoice.id);
    for (const document of [historicalQuote, historicalInvoice]) {
      expect(document?.company.name).toBe("Patch Test GmbH");
      expect(document?.contact?.lastName).toBe("Kontakt");
      expect(document?.companyId).toBe("patch-company");
      expect(document?.contactId).toBe("patch-contact");
    }
    expect(await prisma.activity.count()).toBe(activities);
    expect(await prisma.note.findUnique({ where: { id: note.id } })).not.toBeNull();
    expect(await prisma.emailMessage.findUnique({ where: { id: email.id } })).toMatchObject({
      companyId: "patch-company",
      contactId: "patch-contact",
      quoteId: quote.id,
    });
    const options = await quoteFormOptions(),
      calendar = await calendarFormOptions();
    const active =
      kind === "company"
        ? (
            await listCompanies(companyFiltersSchema.parse({ q: "Patch" }), {
              page: 1,
              pageSize: 25,
            })
          ).companies
        : (
            await listContacts(contactFiltersSchema.parse({ q: "Kontakt" }), {
              page: 1,
              pageSize: 25,
            })
          ).contacts;
    expect(active).toHaveLength(0);
    expect(
      (kind === "company" ? await listCompanyOptions() : await listContactOptions()).some(
        (row) => row.id === id,
      ),
    ).toBe(false);
    for (const selected of [options, calendar])
      expect(
        (kind === "company" ? selected.companies : selected.contacts).some((row) => row.id === id),
      ).toBe(false);
    await expect(
      resolveEmailContext(prisma, { companyId: "patch-company", contactId: "patch-contact" }),
    ).rejects.toThrow("gelöscht");
  },
);

it.each([deleteCompanyFromDetailAction, deleteContactFromDetailAction])(
  "detail delete preserves the authentication guard",
  async (remove) => {
    authenticated = false;
    await expect(remove("patch-company")).rejects.toThrow("AUTH_REQUIRED");
    expect(await prisma.auditLog.count()).toBe(0);
    expect(
      (await prisma.company.findUniqueOrThrow({ where: { id: "patch-company" } })).deletedAt,
    ).toBeNull();
  },
);

it.each(["quote", "invoice"] as const)(
  "opening %s compose prefills the active recipient without changing READY",
  async (kind) => {
    const draft =
      kind === "quote"
        ? await saveQuote("patch-user", input)
        : await saveInvoice("patch-user", input);
    const mutation = { id: draft.id, expectedVersion: draft.version };
    const ready =
      kind === "quote"
        ? await changeQuote("patch-user", mutation, "READY")
        : await changeInvoice("patch-user", mutation, "READY");
    const page = await ComposePage({ searchParams: Promise.resolve({ [`${kind}Id`]: ready.id }) });
    const children = page.props.children as Array<{ props?: Record<string, unknown> }>;
    const compose = children.find((child) => child?.props?.recipient);
    expect(compose?.props?.recipient).toBe("recipient@example.invalid");
    expect(await prisma.emailMessage.count()).toBe(0);
    expect((kind === "quote" ? await getQuote(ready.id) : await getInvoice(ready.id))?.status).toBe(
      "READY",
    );
    await prisma.contact.update({ where: { id: "patch-contact" }, data: { email: null } });
    const missing = await ComposePage({
      searchParams: Promise.resolve({ [`${kind}Id`]: ready.id }),
    });
    expect(missing.props.role).toBe("alert");
    expect(missing.props.children).toContain("keine Empfänger-E-Mail");
    await prisma.contact.update({
      where: { id: "patch-contact" },
      data: { email: "recipient@example.invalid", deletedAt: new Date() },
    });
    const deleted = await ComposePage({
      searchParams: Promise.resolve({ [`${kind}Id`]: ready.id }),
    });
    expect(deleted.props.children).toContain("Kontext ist gelöscht");
    expect(await prisma.emailMessage.count()).toBe(0);
  },
);
