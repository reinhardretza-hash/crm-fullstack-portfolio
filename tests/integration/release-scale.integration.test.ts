import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("server-only", () => ({}));
vi.mock("@/server/rbac", () => ({
  requireUser: () => prisma.user.findUniqueOrThrow({ where: { id: "scale-user" } }),
}));
import { listCompanies } from "@/modules/companies/queries";
import { listContacts } from "@/modules/contacts/queries";
import { listLeads, getPipelineBoard } from "@/modules/leads/queries";
import { listDeals } from "@/modules/deals/queries";
import { listTasks } from "@/modules/tasks/queries";
import { listQuotes } from "@/modules/quotes/queries";
import { listInvoices } from "@/modules/invoices/queries";
import { getDashboardKpis } from "@/modules/dashboard/queries";
import { companyFiltersSchema } from "@/validations/company";
import { contactFiltersSchema } from "@/validations/contact";
import { leadFiltersSchema } from "@/validations/lead";
import { dealFiltersSchema } from "@/validations/deal";
import { taskFiltersSchema } from "@/validations/task";
import { quoteFiltersSchema } from "@/validations/quote";
import { invoiceFiltersSchema } from "@/validations/invoice";
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
beforeEach(async () => {
  await prisma.user.create({
    data: {
      id: "scale-user",
      email: "scale@example.invalid",
      passwordHash: "synthetic-unusable-hash",
      firstName: "Scale",
      lastName: "Fixture",
    },
  });
  await prisma.pipeline.create({
    data: {
      id: "scale-pipeline",
      name: "Scale",
      stages: { create: { id: "scale-stage", name: "Open", position: 1 } },
    },
  });
  await prisma.company.createMany({
    data: range(500).map((i) => ({
      id: `scale-company-${i}`,
      name: `Scale Company ${String(i).padStart(4, "0")}`,
    })),
  });
  await prisma.contact.createMany({
    data: range(1000).map((i) => ({
      id: `scale-contact-${i}`,
      firstName: "Scale",
      lastName: String(i).padStart(4, "0"),
      companyId: `scale-company-${i % 500}`,
    })),
  });
  await prisma.lead.createMany({
    data: range(1000).map((i) => ({
      id: `scale-lead-${i}`,
      title: `Scale Lead ${i}`,
      pipelineId: "scale-pipeline",
      stageId: "scale-stage",
      expectedValueCents: 100,
      companyId: `scale-company-${i % 500}`,
    })),
  });
  await prisma.deal.createMany({
    data: range(500).map((i) => ({
      id: `scale-deal-${i}`,
      name: `Scale Deal ${i}`,
      companyId: `scale-company-${i}`,
      service: "WEBSITE",
      valueCents: 200,
    })),
  });
  await prisma.task.createMany({
    data: range(500).map((i) => ({
      id: `scale-task-${i}`,
      title: `Scale Task ${i}`,
      dueAt: new Date("2030-01-01T12:00:00Z"),
      assignedUserId: "scale-user",
      createdById: "scale-user",
    })),
  });
  const document = (i: number) => ({
    companyId: `scale-company-${i}`,
    assignedUserId: "scale-user",
    createdById: "scale-user",
    issueDate: new Date("2026-01-01"),
    currency: "EUR",
    subtotalCents: 100,
    taxCents: 19,
    totalCents: 119,
    issuerName: "Scale issuer",
    recipientName: "Scale recipient",
    recipientAddress: "Test only",
  });
  await prisma.quote.createMany({
    data: range(250).map((i) => ({
      ...document(i),
      id: `scale-quote-${i}`,
      quoteNumber: `ANG-2026-${String(i + 1).padStart(4, "0")}`,
      validUntil: new Date("2030-01-01"),
    })),
  });
  await prisma.invoice.createMany({
    data: range(250).map((i) => ({
      ...document(i),
      id: `scale-invoice-${i}`,
      invoiceNumber: `RE-2026-${String(i + 1).padStart(4, "0")}`,
      dueDate: new Date("2030-01-01"),
      issuerSnapshot: {},
    })),
  });
});
it("paginates the release-sized dataset and aggregates the entire pipeline without loading it", async () => {
  const started = performance.now();
  const pagination = { page: 1, pageSize: 25 as const };
  const [companies, contacts, leads, deals, tasks, quotes, invoices, board, dashboard] =
    await Promise.all([
      listCompanies(companyFiltersSchema.parse({}), pagination),
      listContacts(contactFiltersSchema.parse({}), pagination),
      listLeads(leadFiltersSchema.parse({}), pagination),
      listDeals(dealFiltersSchema.parse({}), pagination),
      listTasks(taskFiltersSchema.parse({}), pagination),
      listQuotes(quoteFiltersSchema.parse({}), pagination),
      listInvoices(invoiceFiltersSchema.parse({}), pagination),
      getPipelineBoard("scale-pipeline", pagination),
      getDashboardKpis(),
    ]);
  for (const [result, expected] of [
    [companies, 500],
    [contacts, 1000],
    [leads, 1000],
    [deals, 500],
    [tasks, 500],
    [quotes, 250],
    [invoices, 250],
  ] as const)
    expect(result.totalCount).toBe(expected);
  for (const rows of [
    companies.companies,
    contacts.contacts,
    leads.leads,
    deals.deals,
    tasks.tasks,
    quotes.quotes,
    invoices.invoices,
    board.leads,
  ])
    expect(rows).toHaveLength(25);
  expect(board).toMatchObject({ totalCount: 1000, openCount: 1000, openValueCents: 100000 });
  const next = await getPipelineBoard("scale-pipeline", { page: 2, pageSize: 25 });
  expect(next.leads.some((row) => board.leads.some((first) => first.id === row.id))).toBe(false);
  expect(dashboard).toMatchObject({
    activeLeads: 1000,
    pipelineValueEuro: 1000,
    openDeals: 500,
    openDealsValueEuro: 1000,
    openTasks: 500,
  });
  const found = await listCompanies(companyFiltersSchema.parse({ q: "Company 0499" }), pagination);
  expect(found.totalCount).toBe(1);
  await prisma.contact.update({
    where: { id: "scale-contact-499" },
    data: { deletedAt: new Date() },
  });
  const selected = await listCompanies(
    companyFiltersSchema.parse({ q: "Company 0499" }),
    pagination,
  );
  expect(selected.companies[0]._count.contacts).toBe(1);
  console.info(
    JSON.stringify({
      event: "RELEASE_SCALE_QUERY",
      elapsedMs: Math.round(performance.now() - started),
      rows: 4000,
      pageSize: 25,
    }),
  );
}, 30000);
