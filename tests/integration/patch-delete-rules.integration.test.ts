import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
let authenticated = true;
vi.mock("@/server/rbac", () => ({
  requireUser: async () => {
    const user = authenticated
      ? await prisma.user.findFirst({ where: { id: "delete-user", isActive: true } })
      : null;
    if (!user) throw new Error("AUTH_REQUIRED");
    return user;
  },
}));
import { saveQuote, changeQuote } from "@/modules/quotes/service";
import { saveInvoice, changeInvoice } from "@/modules/invoices/service";
import { changeQuoteAction } from "@/modules/quotes/actions";
import { changeInvoiceAction } from "@/modules/invoices/actions";
import {
  deleteDealAction,
  deleteDealFromDetailAction,
  markDealWonAction,
} from "@/modules/deals/actions";
import { getQuote, listQuotes, quoteFormOptions } from "@/modules/quotes/queries";
import { getInvoice, listInvoices } from "@/modules/invoices/queries";
import {
  getDealById,
  getDealDashboardSummary,
  listDeals,
  listDealOptions,
} from "@/modules/deals/queries";
import { getRecentActivities } from "@/modules/dashboard/queries";
import { quoteFiltersSchema } from "@/validations/quote";
import { invoiceFiltersSchema } from "@/validations/invoice";
import { dealFiltersSchema } from "@/validations/deal";
import { QUOTE_STATUSES } from "@/modules/quotes/helpers";
import { INVOICE_STATUSES } from "@/modules/invoices/helpers";
import { resolveEmailContext } from "@/modules/email/context";

type Kind = "quote" | "invoice" | "deal";
const input = {
  companyId: "delete-company",
  contactId: "delete-contact",
  dealId: "delete-deal",
  assignedUserId: "delete-user",
  issueDate: "2026-10-02",
  validUntil: "2199-12-31",
  dueDate: "2199-12-31",
  taxRateBasisPoints: 1900,
  items: [
    {
      title: "Synthetic",
      quantity: "1",
      unit: "Stück",
      unitPrice: "100",
      taxRateBasisPoints: "1900",
    },
  ],
};
const pagination = { page: 1, pageSize: 25 as const };
beforeEach(async () => {
  authenticated = true;
  await prisma.user.create({
    data: {
      id: "delete-user",
      email: "delete@example.invalid",
      passwordHash: "unusable",
      firstName: "Delete",
      lastName: "Test",
      role: "OWNER",
    },
  });
  await prisma.company.create({
    data: {
      id: "delete-company",
      name: "Delete Test",
      street: "Teststraße 1",
      postalCode: "12345",
      city: "Teststadt",
    },
  });
  await prisma.contact.create({
    data: {
      id: "delete-contact",
      firstName: "Delete",
      companyId: "delete-company",
      email: "recipient@example.invalid",
    },
  });
  await prisma.deal.create({
    data: {
      id: "delete-deal",
      name: "Delete Deal",
      companyId: "delete-company",
      contactId: "delete-contact",
      service: "WEBSITE",
      valueCents: 10000,
    },
  });
});
async function create(kind: Kind) {
  return kind === "quote"
    ? saveQuote("delete-user", input)
    : kind === "invoice"
      ? saveInvoice("delete-user", input)
      : prisma.deal.findUniqueOrThrow({ where: { id: "delete-deal" } });
}
async function remove(kind: Kind, row: { id: string; version: number }) {
  if (kind === "quote")
    return changeQuote("delete-user", { id: row.id, expectedVersion: row.version }, "DELETE");
  if (kind === "invoice")
    return changeInvoice("delete-user", { id: row.id, expectedVersion: row.version }, "DELETE");
  return deleteDealAction(row.id, row.version);
}
async function action(kind: Kind, row: { id: string; version: number }) {
  if (kind === "quote") return changeQuoteAction(row.id, row.version, "DELETE", { error: null });
  if (kind === "invoice")
    return changeInvoiceAction(row.id, row.version, "DELETE", { error: null });
  return deleteDealFromDetailAction(row.id, row.version);
}

it.each(QUOTE_STATUSES)(
  "quote %s deletion is enforced by the service and direct server action",
  async (status) => {
    const draft = await create("quote");
    const row = await prisma.quote.update({ where: { id: draft.id }, data: { status } });
    if (["DRAFT", "READY"].includes(status)) {
      await expect(action("quote", row)).rejects.toThrow("REDIRECT:/quotes?deleted=1");
      expect(await getQuote(row.id)).toBeNull();
      expect((await prisma.quote.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(status);
      await expect(remove("quote", row)).rejects.toThrow("nicht gefunden");
      expect(
        await prisma.auditLog.count({ where: { action: "QUOTE_DELETED", entityId: row.id } }),
      ).toBe(1);
    } else {
      expect((await action("quote", row)).error).toContain("Nur Angebote");
      await expect(remove("quote", row)).rejects.toThrow("Nur Angebote");
      expect((await getQuote(row.id))?.deletedAt).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: "QUOTE_DELETED" } })).toBe(0);
    }
  },
);
it.each(INVOICE_STATUSES)(
  "invoice %s deletion is enforced by the service and direct server action",
  async (status) => {
    const draft = await create("invoice");
    const row = await prisma.invoice.update({ where: { id: draft.id }, data: { status } });
    if (["DRAFT", "READY"].includes(status)) {
      await expect(action("invoice", row)).rejects.toThrow("REDIRECT:/invoices?deleted=1");
      expect(await getInvoice(row.id)).toBeNull();
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
        status,
      );
      await expect(remove("invoice", row)).rejects.toThrow("nicht gefunden");
      expect(
        await prisma.auditLog.count({ where: { action: "INVOICE_DELETED", entityId: row.id } }),
      ).toBe(1);
    } else {
      expect((await action("invoice", row)).error).toContain("Nur Rechnungen");
      await expect(remove("invoice", row)).rejects.toThrow("Nur Rechnungen");
      expect((await getInvoice(row.id))?.deletedAt).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: "INVOICE_DELETED" } })).toBe(0);
    }
  },
);
it.each(["OPEN", "WON", "LOST"] as const)(
  "deal %s deletion is enforced by direct actions",
  async (status) => {
    const row = await prisma.deal.update({
      where: { id: "delete-deal" },
      data: { status, closedAt: status === "OPEN" ? null : new Date() },
    });
    if (status === "OPEN") {
      await expect(action("deal", row)).rejects.toThrow("REDIRECT:/deals?deleted=1");
      expect(await getDealById(row.id)).toBeNull();
      await expect(remove("deal", row)).rejects.toThrow("bereits gelöscht");
      expect(
        await prisma.auditLog.count({ where: { action: "DEAL_DELETED", entityId: row.id } }),
      ).toBe(1);
      expect(
        await prisma.activity.count({
          where: {
            dealId: row.id,
            type: "DEAL_UPDATED",
            metadata: { path: ["softDeleted"], equals: true },
          },
        }),
      ).toBe(1);
    } else {
      expect((await action("deal", row)).error).toContain("Nur offene Deals");
      await expect(remove("deal", row)).rejects.toThrow("Nur offene Deals");
      expect((await getDealById(row.id))?.deletedAt).toBeNull();
      expect(await prisma.auditLog.count()).toBe(0);
    }
  },
);
it("blocks deletion of a date-expired READY quote", async () => {
  const draft = await create("quote");
  const row = await prisma.quote.update({
    where: { id: draft.id },
    data: {
      status: "READY",
      issueDate: new Date("2020-01-01"),
      validUntil: new Date("2020-02-01"),
    },
  });
  expect((await action("quote", row)).error).toContain("Abgelaufene");
});
it.each(["quote", "invoice", "deal"] as const)(
  "%s rejects unauthenticated and inactive users before deletion",
  async (kind) => {
    const row = await create(kind);
    authenticated = false;
    await expect(action(kind, row)).rejects.toThrow("AUTH_REQUIRED");
    authenticated = true;
    await prisma.user.update({ where: { id: "delete-user" }, data: { isActive: false } });
    await expect(action(kind, row)).rejects.toThrow("AUTH_REQUIRED");
    expect(
      await prisma.auditLog.count({
        where: { action: { in: ["QUOTE_DELETED", "INVOICE_DELETED", "DEAL_DELETED"] } },
      }),
    ).toBe(0);
  },
);
it.each(["quote", "invoice", "deal"] as const)(
  "%s rejects stale OCC and serializes parallel deletes",
  async (kind) => {
    const row = await create(kind);
    await expect(remove(kind, { ...row, version: row.version + 1 })).rejects.toThrow(
      "zwischenzeitlich",
    );
    const outcomes = await Promise.allSettled([remove(kind, row), remove(kind, row)]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: {
          entityId: row.id,
          action: { in: ["QUOTE_DELETED", "INVOICE_DELETED", "DEAL_DELETED"] },
        },
      }),
    ).toBe(1);
  },
);
it("serializes deal won versus delete with a single winner", async () => {
  const row = await create("deal");
  const outcomes = await Promise.allSettled([
    remove("deal", row),
    markDealWonAction({ dealId: row.id, expectedVersion: row.version }),
  ]);
  const won = outcomes[1].status === "fulfilled" && outcomes[1].value?.success === true;
  expect(Number(outcomes[0].status === "fulfilled") + Number(won)).toBe(1);
  const final = await prisma.deal.findUniqueOrThrow({ where: { id: row.id } });
  expect(final.version).toBe(row.version + 1);
  expect(final.deletedAt ? final.status === "OPEN" : final.status === "WON").toBe(true);
});
it.each(["quote", "invoice"] as const)(
  "%s stays protected during unresolved SMTP submission",
  async (kind) => {
    const draft = await create(kind);
    const row =
      kind === "quote"
        ? await changeQuote(
            "delete-user",
            { id: draft.id, expectedVersion: draft.version },
            "READY",
          )
        : await changeInvoice(
            "delete-user",
            { id: draft.id, expectedVersion: draft.version },
            "READY",
          );
    await prisma.emailMessage.create({
      data: {
        status: "SENDING",
        idempotencyKey: "pending-send",
        requestHash: "a".repeat(64),
        fromEmail: "sender@example.invalid",
        toEmail: "recipient@example.invalid",
        subject: "Synthetic",
        textBody: "Test",
        sentByUserId: "delete-user",
        ...(kind === "quote"
          ? { quoteId: row.id, quoteVersion: row.version }
          : { invoiceId: row.id, invoiceVersion: row.version }),
      },
    });
    await expect(remove(kind, row)).rejects.toThrow("Versandstatus");
  },
);
it.each(["quote", "invoice"] as const)(
  "%s retains items, email, activity, audit and parents; disappears from search and dashboard",
  async (kind) => {
    const row = await create(kind);
    const email = await prisma.emailMessage.create({
      data: {
        status: "FAILED",
        idempotencyKey: "historical-email",
        requestHash: "a".repeat(64),
        fromEmail: "sender@example.invalid",
        toEmail: "recipient@example.invalid",
        subject: "Synthetic",
        textBody: "Test",
        sentByUserId: "delete-user",
        companyId: input.companyId,
        contactId: input.contactId,
        dealId: input.dealId,
        ...(kind === "quote"
          ? { quoteId: row.id, quoteVersion: row.version }
          : { invoiceId: row.id, invoiceVersion: row.version }),
      },
    });
    const auditBefore = await prisma.auditLog.count({ where: { entityId: row.id } });
    await remove(kind, row);
    const raw =
      kind === "quote"
        ? await prisma.quote.findUniqueOrThrow({
            where: { id: row.id },
            include: { items: true, company: true, contact: true, deal: true },
          })
        : await prisma.invoice.findUniqueOrThrow({
            where: { id: row.id },
            include: { items: true, company: true, contact: true, deal: true },
          });
    expect(raw.items).toHaveLength(1);
    expect(raw.company.id).toBe(input.companyId);
    expect(raw.contact?.id).toBe(input.contactId);
    expect(raw.deal?.id).toBe(input.dealId);
    expect(await prisma.emailMessage.findUnique({ where: { id: email.id } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: row.id } })).toBe(auditBefore + 1);
    expect(
      await prisma.activity.count({
        where: kind === "quote" ? { quoteId: row.id } : { invoiceId: row.id },
      }),
    ).toBe(2);
    for (const q of [undefined, "Delete Test"]) {
      const list =
        kind === "quote"
          ? await listQuotes(quoteFiltersSchema.parse({ q }), pagination)
          : await listInvoices(invoiceFiltersSchema.parse({ q }), pagination);
      expect(list.totalCount).toBe(0);
    }
    expect(await getRecentActivities()).toHaveLength(0);
  },
);
it("deal deletion preserves linked documents, tasks, calendar, notes and history and excludes active counts/options", async () => {
  const pipeline = await prisma.pipeline.create({
    data: { name: "Delete Test", stages: { create: { name: "Open", position: 1 } } },
    include: { stages: true },
  });
  const lead = await prisma.lead.create({
    data: {
      title: "Historical lead",
      companyId: input.companyId,
      contactId: input.contactId,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
    },
  });
  await prisma.deal.update({ where: { id: input.dealId }, data: { leadId: lead.id } });
  const email = await prisma.emailMessage.create({
    data: {
      status: "FAILED",
      idempotencyKey: "historical-deal-email",
      requestHash: "a".repeat(64),
      fromEmail: "sender@example.invalid",
      toEmail: "recipient@example.invalid",
      subject: "Synthetic",
      textBody: "Test",
      sentByUserId: "delete-user",
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
      leadId: lead.id,
    },
  });
  const quote = await create("quote"),
    invoice = await create("invoice");
  const note = await prisma.note.create({
    data: { content: "Synthetic", authorId: "delete-user", dealId: input.dealId },
  });
  const task = await prisma.task.create({
    data: {
      title: "Synthetic",
      dueAt: new Date(),
      assignedUserId: "delete-user",
      createdById: "delete-user",
      dealId: input.dealId,
    },
  });
  const calendar = await prisma.calendarEvent.create({
    data: {
      title: "Synthetic",
      startsAt: new Date("2026-10-02T09:00:00Z"),
      endsAt: new Date("2026-10-02T10:00:00Z"),
      assignedUserId: "delete-user",
      createdById: "delete-user",
      dealId: input.dealId,
    },
  });
  await remove("deal", await create("deal"));
  expect((await getQuote(quote.id))?.deal?.name).toBe("Delete Deal");
  expect((await getInvoice(invoice.id))?.deal?.name).toBe("Delete Deal");
  expect(await prisma.note.findUnique({ where: { id: note.id } })).not.toBeNull();
  expect(await prisma.task.findUnique({ where: { id: task.id } })).not.toBeNull();
  expect(await prisma.calendarEvent.findUnique({ where: { id: calendar.id } })).not.toBeNull();
  expect(await prisma.lead.findUnique({ where: { id: lead.id } })).not.toBeNull();
  expect(await prisma.emailMessage.findUnique({ where: { id: email.id } })).not.toBeNull();
  expect(await prisma.company.findUnique({ where: { id: input.companyId } })).not.toBeNull();
  expect(await prisma.contact.findUnique({ where: { id: input.contactId } })).not.toBeNull();
  expect((await listDeals(dealFiltersSchema.parse({ q: "Delete" }), pagination)).totalCount).toBe(
    0,
  );
  expect(await listDealOptions()).toHaveLength(0);
  expect((await quoteFormOptions()).deals).toHaveLength(0);
  expect(await getDealDashboardSummary()).toMatchObject({ openDeals: 0, openDealsValueCents: 0 });
  expect(await getRecentActivities()).toHaveLength(0);
  await expect(resolveEmailContext(prisma, { dealId: input.dealId })).rejects.toThrow("gelöscht");
  await expect(saveQuote("delete-user", input)).rejects.toThrow();
  await expect(saveInvoice("delete-user", input)).rejects.toThrow();
});
it("deleting a READY invoice preserves its accepted quote and quote positions", async () => {
  let quote = await saveQuote("delete-user", input);
  for (const status of ["READY", "SENT", "ACCEPTED"] as const)
    quote = await changeQuote(
      "delete-user",
      { id: quote.id, expectedVersion: quote.version },
      status,
    );
  let invoice = await saveInvoice("delete-user", { ...input, quoteId: quote.id });
  invoice = await changeInvoice(
    "delete-user",
    { id: invoice.id, expectedVersion: invoice.version },
    "READY",
  );
  await remove("invoice", invoice);
  const historical = await getQuote(quote.id);
  expect(historical?.status).toBe("ACCEPTED");
  expect(historical?.items).toHaveLength(1);
  expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).quoteId).toBe(
    quote.id,
  );
});
it.each(["quote", "invoice"] as const)(
  "database continues to reject deleting sent %s",
  async (kind) => {
    const row = await create(kind);
    await expect(
      kind === "quote"
        ? prisma.quote.update({
            where: { id: row.id },
            data: { status: "SENT", deletedAt: new Date() },
          })
        : prisma.invoice.update({
            where: { id: row.id },
            data: { status: "SENT", deletedAt: new Date() },
          }),
    ).rejects.toThrow();
  },
);
