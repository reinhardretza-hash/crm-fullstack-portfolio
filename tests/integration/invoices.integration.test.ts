import { randomUUID } from "node:crypto";
import { beforeEach, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`REDIRECT:${href}`);
  },
}));
let userId: string | null = null;
vi.mock("@/server/rbac", () => ({
  requireUser: async () => {
    if (!userId) throw new Error("AUTH_REQUIRED");
    const user = await prisma.user.findFirst({ where: { id: userId, isActive: true } });
    if (!user) throw new Error("AUTH_REQUIRED");
    return user;
  },
  getCurrentUser: async () =>
    userId ? prisma.user.findFirst({ where: { id: userId, isActive: true } }) : null,
}));
const smtp = vi.hoisted(() => ({ sendSmtpMail: vi.fn(), getSmtpConfig: vi.fn() }));
vi.mock("@/modules/email/smtp", () => smtp);
import { saveInvoice, changeInvoice, INVOICE_CONFLICT_MESSAGE } from "@/modules/invoices/service";
import { getInvoice, listInvoices } from "@/modules/invoices/queries";
import { invoiceFiltersSchema } from "@/validations/invoice";
import { saveInvoiceAction, changeInvoiceAction } from "@/modules/invoices/actions";
import { sendEmail } from "@/modules/email/service";
import { invoiceEmailPrefill } from "@/modules/invoices/helpers";
import { GET } from "@/app/(dashboard)/invoices/[id]/pdf/route";
import * as activityLog from "@/modules/activity/log";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
let companyId: string, contactId: string, dealId: string;
const position = (extra: Record<string, unknown> = {}) => ({
  title: "Beratung",
  description: "Leistungsumfang",
  quantity: "1.5",
  unit: "Stunde",
  unitPrice: "100.00",
  taxRateBasisPoints: "1900",
  ...extra,
});
const input = (extra: Record<string, unknown> = {}) => ({
  companyId,
  contactId,
  dealId,
  assignedUserId: userId,
  issueDate: "2026-10-01",
  dueDate: "2199-12-31",
  taxRateBasisPoints: 1900,
  items: [position()],
  introText: "Intro",
  closingText: "Ende",
  customerNote: "Kundenhinweis",
  internalNote: "INVOICE_INTERNAL_ONLY",
  ...extra,
});
const mutation = (invoice: { id: string; version: number }) => ({
  id: invoice.id,
  expectedVersion: invoice.version,
});
const page = { page: 1, pageSize: 25 as const };
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  smtp.getSmtpConfig.mockReturnValue({
    fromEmail: "sender@example.invalid",
    fromName: "RDEvolution GbR",
  });
  smtp.sendSmtpMail.mockResolvedValue("<invoice@example.invalid>");
  userId = (
    await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: randomUUID(),
        firstName: "Invoice",
        lastName: "Tester",
        role: "USER",
      },
    })
  ).id;
  companyId = (
    await prisma.company.create({
      data: {
        name: "Müller Invoice GmbH",
        street: "Teststraße 1",
        postalCode: "12345",
        city: "Berlin",
      },
    })
  ).id;
  contactId = (
    await prisma.contact.create({
      data: {
        firstName: "Anna",
        lastName: "Müller",
        companyId,
        email: "recipient@example.invalid",
      },
    })
  ).id;
  dealId = (
    await prisma.deal.create({
      data: {
        name: "Invoice Deal",
        companyId,
        contactId,
        assignedUserId: userId,
        service: "WEBSITE",
        valueCents: 10000,
      },
    })
  ).id;
});
async function ready() {
  return changeInvoice(userId!, mutation(await saveInvoice(userId!, input())), "READY");
}
async function sent() {
  return changeInvoice(userId!, mutation(await ready()), "SENT");
}
async function pdfText(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer) });
  const doc = await task.promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++)
    text += (await (await doc.getPage(p)).getTextContent()).items
      .map((i) => ("str" in i ? i.str : ""))
      .join(" ");
  await task.destroy();
  return text;
}
function mail(invoice: Awaited<ReturnType<typeof ready>>, extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    invoiceId: invoice.id,
    invoiceVersion: invoice.version,
    toEmail: "recipient@example.invalid",
    ...invoiceEmailPrefill(invoice),
    ...extra,
  };
}
it("creates canonical DRAFT relationships and safe history", async () => {
  const invoice = await saveInvoice(
    userId!,
    input({ totalCents: 1, currency: "USD", status: "PAID" }),
  );
  expect(invoice).toMatchObject({
    status: "DRAFT",
    currency: "EUR",
    subtotalCents: 15000,
    taxCents: 2850,
    totalCents: 17850,
    companyId,
    contactId,
    dealId,
  });
  const row = await getInvoice(invoice.id);
  expect(row?.items[0]).toMatchObject({
    quantity: 1500,
    unitPriceCents: 10000,
    taxRateBasisPoints: 1900,
  });
  expect(row?.activities[0]).toMatchObject({ type: "INVOICE_CREATED", invoiceId: invoice.id });
  const audit = await prisma.auditLog.findFirst({ where: { entityId: invoice.id } });
  expect(JSON.stringify(audit)).not.toContain("INVOICE_INTERNAL_ONLY");
  expect(JSON.stringify(audit)).not.toContain("iban");
});
it("creates twenty parallel unique consecutive invoice numbers", async () => {
  const rows = await Promise.all(Array.from({ length: 20 }, () => saveInvoice(userId!, input())));
  expect(new Set(rows.map((i) => i.invoiceNumber)).size).toBe(20);
  expect(rows.map((i) => Number(i.invoiceNumber.split("-")[2])).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 20 }, (_, i) => i + 1),
  );
});
it("rolls number and content back on history failure", async () => {
  vi.spyOn(activityLog, "logActivity").mockRejectedValueOnce(new Error("fail"));
  await expect(saveInvoice(userId!, input())).rejects.toThrow();
  expect(await prisma.invoice.count()).toBe(0);
  expect(await prisma.invoiceNumberSequence.count()).toBe(0);
  expect((await saveInvoice(userId!, input())).invoiceNumber).toMatch(/-0001$/);
});
it("reorders, changes, adds and removes positions atomically", async () => {
  const first = await saveInvoice(
    userId!,
    input({ items: [position({ title: "A" }), position({ title: "B", taxRateBasisPoints: 700 })] }),
  );
  const old = await getInvoice(first.id);
  const ids = old!.items.map((i) => i.id);
  await saveInvoice(
    userId!,
    input({
      items: [
        position({ id: ids[1], title: "B", unitPrice: "200", taxRateBasisPoints: 700 }),
        position({ id: ids[0], title: "A" }),
        position({ title: "C", taxRateBasisPoints: 0 }),
      ],
    }),
    mutation(first),
  );
  const updated = await getInvoice(first.id);
  expect(updated?.items.map((i) => i.id).slice(0, 2)).toEqual([ids[1], ids[0]]);
  expect(updated?.items.map((i) => i.position)).toEqual([1, 2, 3]);
  expect(updated?.subtotalCents).toBe(60000);
  await saveInvoice(
    userId!,
    input({ items: [position({ id: ids[0], title: "A" })] }),
    mutation(updated!),
  );
  expect((await getInvoice(first.id))?.items).toHaveLength(1);
});
it("exactly one concurrent content update wins", async () => {
  const row = await saveInvoice(userId!, input());
  const results = await Promise.allSettled([
    saveInvoice(userId!, input({ introText: "A" }), mutation(row)),
    saveInvoice(userId!, input({ introText: "B" }), mutation(row)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await getInvoice(row.id))?.version).toBe(2);
});
it("stale status changes fail", async () => {
  const row = await ready();
  await changeInvoice(userId!, mutation(row), "SENT");
  await expect(changeInvoice(userId!, mutation(row), "CANCELLED")).rejects.toThrow(
    INVOICE_CONFLICT_MESSAGE,
  );
});
it.each(["SENT", "PAID", "CANCELLED"] as const)(
  "protects content and deletion in %s",
  async (status) => {
    let row = await sent();
    if (status !== "SENT") row = await changeInvoice(userId!, mutation(row), status);
    await expect(saveInvoice(userId!, input(), mutation(row))).rejects.toThrow("schreibgeschützt");
    await expect(changeInvoice(userId!, mutation(row), "DELETE")).rejects.toThrow();
    expect((await prisma.deal.findUnique({ where: { id: dealId } }))?.status).toBe("OPEN");
  },
);
it("manual PAID is terminal and timestamps are recorded", async () => {
  const row = await changeInvoice(userId!, mutation(await sent()), "PAID");
  expect(row.paidAt).toBeInstanceOf(Date);
  expect(row.sentAt).toBeInstanceOf(Date);
  await expect(changeInvoice(userId!, mutation(row), "SENT")).rejects.toThrow();
});
it("cancel is an internal terminal state with timestamp", async () => {
  const row = await changeInvoice(userId!, mutation(await ready()), "CANCELLED");
  expect(row.cancelledAt).toBeInstanceOf(Date);
});
it("soft deletes draft and ready and never reuses number", async () => {
  const row = await saveInvoice(userId!, input());
  await changeInvoice(userId!, mutation(row), "DELETE");
  expect(await getInvoice(row.id)).toBeNull();
  const next = await saveInvoice(userId!, input());
  expect(next.invoiceNumber).toMatch(/-0002$/);
  expect(
    (await changeInvoice(userId!, mutation(await ready()), "DELETE")).deletedAt,
  ).toBeInstanceOf(Date);
});
it("requires a position before READY", async () => {
  const row = await saveInvoice(userId!, input());
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: row.id } });
  await expect(changeInvoice(userId!, mutation(row), "READY")).rejects.toThrow("Position");
});
it("rejects missing actor, inactive assignee and inconsistent context", async () => {
  await expect(saveInvoice("unknown", input())).rejects.toThrow();
  await expect(saveInvoice(userId!, input({ companyId: "missing" }))).rejects.toThrow();
  await prisma.user.update({ where: { id: userId! }, data: { isActive: false } });
  await expect(saveInvoice(userId!, input())).rejects.toThrow();
});
it("rejects foreign and duplicate position IDs", async () => {
  const row = await saveInvoice(userId!, input());
  const item = (await getInvoice(row.id))!.items[0];
  await expect(
    saveInvoice(userId!, input({ items: [position({ id: "foreign" })] }), mutation(row)),
  ).rejects.toThrow("positionen");
  await expect(
    saveInvoice(
      userId!,
      input({ items: [position({ id: item.id }), position({ id: item.id })] }),
      mutation(row),
    ),
  ).rejects.toThrow("positionen");
});
it("derives overdue only for SENT and supports PAID from overdue", async () => {
  const past = await saveInvoice(
    userId!,
    input({ issueDate: "2020-01-01", dueDate: "2020-01-15" }),
  );
  const r = await changeInvoice(userId!, mutation(past), "READY");
  const s = await changeInvoice(userId!, mutation(r), "SENT");
  const found = await listInvoices(
    invoiceFiltersSchema.parse({
      status: "OVERDUE",
      overdue: "yes",
      dueFrom: "2020-01-01",
      dueTo: "2020-01-31",
    }),
    page,
  );
  expect(found.invoices.map((i) => i.id)).toEqual([s.id]);
  expect(
    (await listInvoices(invoiceFiltersSchema.parse({ status: "SENT" }), page)).totalCount,
  ).toBe(0);
  const paid = await changeInvoice(userId!, mutation(s), "PAID");
  expect(paid.status).toBe("PAID");
  expect(
    (await listInvoices(invoiceFiltersSchema.parse({ overdue: "yes" }), page)).totalCount,
  ).toBe(0);
});
it("search filters and pagination", async () => {
  await saveInvoice(userId!, input());
  await saveInvoice(userId!, input());
  const found = await listInvoices(
    invoiceFiltersSchema.parse({
      q: "Müller",
      companyId,
      userId: userId!,
      dateFrom: "2026-10-01",
      dateTo: "2026-10-01",
      sort: "number",
      direction: "asc",
    }),
    { page: 1, pageSize: 25 },
  );
  expect(found.totalCount).toBe(2);
  expect(found.invoices[0].invoiceNumber).toMatch(/0001$/);
});
it("quote mapping creates separate items, snapshots and history without changing deal", async () => {
  const { saveQuote, changeQuote } = await import("@/modules/quotes/service");
  const { quoteToInvoiceDefaults } = await import("@/modules/invoices/mapping");
  let quote = await saveQuote(userId!, { ...input(), validUntil: "2199-12-31" });
  quote = await changeQuote(userId!, mutation(quote), "READY");
  quote = await changeQuote(userId!, mutation(quote), "SENT");
  quote = await changeQuote(userId!, mutation(quote), "ACCEPTED");
  const full = await prisma.quote.findUniqueOrThrow({
    where: { id: quote.id },
    include: { items: true },
  });
  const row = await saveInvoice(userId!, {
    ...input(),
    ...quoteToInvoiceDefaults(full),
    quoteId: quote.id,
  });
  const invoice = await getInvoice(row.id);
  expect(invoice?.quoteId).toBe(quote.id);
  expect(invoice?.items[0].id).not.toBe(full.items[0].id);
  await prisma.quoteItem.update({
    where: { id: full.items[0].id },
    data: { title: "DIRECT_TEST_CHANGE" },
  });
  expect((await getInvoice(row.id))?.items[0].title).toBe(full.items[0].title);
  expect(
    await prisma.activity.count({ where: { quoteId: quote.id, type: "INVOICE_CREATED" } }),
  ).toBe(1);
  await expect(saveInvoice(userId!, { ...input(), quoteId: quote.id })).rejects.toThrow("bereits");
  await expect(
    saveInvoice(userId!, { ...input(), quoteId: quote.id, confirmDuplicate: true }),
  ).resolves.toMatchObject({ quoteId: quote.id });
  await expect(
    saveInvoice(userId!, input({ quoteId: quote.id, companyId: "other", confirmDuplicate: true })),
  ).rejects.toThrow();
});
it("rejects invoices from unaccepted quotes", async () => {
  const { saveQuote } = await import("@/modules/quotes/service");
  const quote = await saveQuote(userId!, { ...input(), validUntil: "2199-12-31" });
  await expect(saveInvoice(userId!, input({ quoteId: quote.id }))).rejects.toThrow("angenommene");
});
it("PDF authentication, private response and internal-note exclusion", async () => {
  const row = await saveInvoice(userId!, input());
  const actor = userId;
  userId = null;
  expect(
    (
      await GET(new Request("http://localhost/invoices/x/pdf"), {
        params: Promise.resolve({ id: row.id }),
      })
    ).status,
  ).toBe(401);
  userId = actor;
  expect(
    (
      await GET(new Request("http://localhost/invoices/x/pdf"), {
        params: Promise.resolve({ id: "missing" }),
      })
    ).status,
  ).toBe(404);
  const response = await GET(new Request("http://localhost/invoices/x/pdf?download=1"), {
    params: Promise.resolve({ id: row.id }),
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  const text = await pdfText(Buffer.from(await response.arrayBuffer()));
  expect(text).toContain(row.invoiceNumber);
  expect(text).toContain("ENTWICKLUNGSSTAND");
  expect(text).not.toContain("INVOICE_INTERNAL_ONLY");
});
it("PDF issuer and customer remain frozen after SENT", async () => {
  await prisma.systemSettings.updateMany({
    data: {
      legalCompanyName: "TEST ISSUER",
      street: "Teststraße 9",
      postalCode: "12345",
      city: "Berlin",
      taxNumber: "TEST_ONLY",
      iban: "TEST_IBAN",
    },
  });
  const row = await sent();
  await prisma.systemSettings.updateMany({
    data: { legalCompanyName: "CHANGED", iban: "CHANGED" },
  });
  await prisma.company.update({ where: { id: companyId }, data: { name: "CHANGED" } });
  const response = await GET(new Request("http://localhost/pdf"), {
    params: Promise.resolve({ id: row.id }),
  });
  const text = await pdfText(Buffer.from(await response.arrayBuffer()));
  expect(text).toContain("TEST ISSUER");
  expect(text).toContain("TEST_IBAN");
  expect(text).not.toContain("CHANGED");
  expect(text).not.toContain("ENTWICKLUNGSSTAND");
  const audit = await prisma.auditLog.findMany({ where: { entityId: row.id } });
  expect(JSON.stringify(audit)).not.toContain("TEST_IBAN");
});
it("SMTP success attaches persisted PDF, SENT and idempotent replay", async () => {
  const row = await ready();
  const request = mail(row);
  const message = await sendEmail(userId!, request);
  expect(message.status).toBe("SENT");
  expect(message.invoiceId).toBe(row.id);
  expect((await getInvoice(row.id))?.status).toBe("SENT");
  const sentMail = smtp.sendSmtpMail.mock.calls[0][0];
  expect(sentMail.subject).toBe(`Rechnung ${row.invoiceNumber} – RDEvolution GbR`);
  expect(sentMail.toEmail).toBe("recipient@example.invalid");
  expect(sentMail.quoteAttachment.filename).toBe(`${row.invoiceNumber}.pdf`);
  expect(Buffer.isBuffer(sentMail.quoteAttachment.content)).toBe(true);
  expect(await pdfText(sentMail.quoteAttachment.content)).not.toContain("INVOICE_INTERNAL_ONLY");
  expect((await sendEmail(userId!, request)).id).toBe(message.id);
  expect(smtp.sendSmtpMail).toHaveBeenCalledTimes(1);
});
it("SMTP failure remains READY and editable", async () => {
  smtp.sendSmtpMail.mockRejectedValueOnce(
    Object.assign(new Error("mock failure"), { code: "EAUTH" }),
  );
  const row = await ready();
  expect((await sendEmail(userId!, mail(row))).status).toBe("FAILED");
  const updated = await getInvoice(row.id);
  expect(updated?.status).toBe("READY");
  await expect(saveInvoice(userId!, input(), mutation(updated!))).resolves.toBeDefined();
});
it("in-flight sending blocks content, status and duplicate sends", async () => {
  const row = await ready();
  let release: (value: string) => void = () => {};
  const gate = new Promise<string>((resolve) => {
    release = resolve;
  });
  smtp.sendSmtpMail.mockReturnValueOnce(gate);
  const sending = sendEmail(userId!, mail(row));
  await vi.waitFor(() => expect(smtp.sendSmtpMail).toHaveBeenCalledTimes(1));
  const reserved = await getInvoice(row.id);
  await expect(saveInvoice(userId!, input(), mutation(reserved!))).rejects.toThrow("Versand");
  await expect(changeInvoice(userId!, mutation(reserved!), "CANCELLED")).rejects.toThrow("Versand");
  await expect(sendEmail(userId!, mail(reserved!))).rejects.toThrow("Versand");
  release("<done@example.invalid>");
  await sending;
});
it("unclear post-SMTP finalization remains SENDING and cannot retry", async () => {
  const row = await ready();
  vi.spyOn(activityLog, "logActivity").mockRejectedValueOnce(new Error("history DB error"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const request = mail(row);
  const message = await sendEmail(userId!, request);
  expect(message.status).toBe("SENDING");
  expect((await getInvoice(row.id))?.status).toBe("READY");
  expect((await sendEmail(userId!, request)).id).toBe(message.id);
  expect(smtp.sendSmtpMail).toHaveBeenCalledTimes(1);
  expect(log).toHaveBeenCalledOnce();
});
it("rejects stale version, inconsistent email context and two document attachments", async () => {
  const row = await ready();
  await expect(sendEmail(userId!, mail(row, { invoiceVersion: 1 }))).rejects.toThrow(
    INVOICE_CONFLICT_MESSAGE,
  );
  await expect(sendEmail(userId!, mail(row, { companyId: "wrong" }))).rejects.toThrow();
  await expect(
    sendEmail(userId!, mail(row, { quoteId: "quote", quoteVersion: 1 })),
  ).rejects.toThrow();
  expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
});
it("actions require auth and preserve successful redirect", async () => {
  const form = new FormData();
  const values = input();
  for (const [k, v] of Object.entries(values))
    form.set(k, k === "items" ? JSON.stringify(v) : String(v));
  await expect(saveInvoiceAction(null, 0, { error: null }, form)).rejects.toThrow(
    "REDIRECT:/invoices/",
  );
  const row = await prisma.invoice.findFirstOrThrow();
  await expect(changeInvoiceAction(row.id, row.version, "READY", { error: null })).rejects.toThrow(
    "REDIRECT:",
  );
  userId = null;
  await expect(saveInvoiceAction(null, 0, { error: null }, form)).rejects.toThrow("AUTH_REQUIRED");
  await expect(getInvoice(row.id)).rejects.toThrow("AUTH_REQUIRED");
});
it("DB rejects invalid dates, amounts, version, identity and email NULL version", async () => {
  const row = await ready();
  for (const data of [
    { dueDate: new Date("2020-01-01") },
    { totalCents: -1 },
    { version: 0 },
    { invoiceNumber: "RE-2026-9999" },
    { currency: "USD" },
    { quoteId: "other" },
    { deletedAt: new Date(), status: "SENT" as const },
  ])
    await expect(prisma.invoice.update({ where: { id: row.id }, data })).rejects.toThrow();
  const line = (await getInvoice(row.id))!.items[0];
  await expect(
    prisma.invoiceItem.update({ where: { id: line.id }, data: { quantity: 0 } }),
  ).rejects.toThrow();
  const message = await sendEmail(userId!, mail(row));
  await expect(
    prisma.emailMessage.update({ where: { id: message.id }, data: { invoiceVersion: null } }),
  ).rejects.toThrow();
  await expect(
    prisma.systemSettings.updateMany({ data: { defaultPaymentTermDays: -1 } }),
  ).rejects.toThrow();
});
it("timeout after SMTP submission retains SENDING and blocks a new attempt", async () => {
  const row = await ready();
  smtp.sendSmtpMail.mockRejectedValueOnce(
    Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
  );
  const request = mail(row);
  const message = await sendEmail(userId!, request);
  expect(message.status).toBe("SENDING");
  expect(message.errorCode).toBe("TIMEOUT");
  const reserved = await getInvoice(row.id);
  expect(reserved?.status).toBe("READY");
  await expect(sendEmail(userId!, mail(reserved!))).rejects.toThrow("Versand");
  await expect(changeInvoice(userId!, mutation(reserved!), "SENT")).rejects.toThrow("Versand");
  expect((await sendEmail(userId!, request)).id).toBe(message.id);
  expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
});
it("two parallel fresh send keys deliver one invoice", async () => {
  const row = await ready();
  const results = await Promise.allSettled([
    sendEmail(userId!, mail(row)),
    sendEmail(userId!, mail(row)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
});
it("concurrent duplicate creation from accepted quote requires confirmation", async () => {
  const { saveQuote, changeQuote } = await import("@/modules/quotes/service");
  let q = await saveQuote(userId!, { ...input(), validUntil: "2199-12-31" });
  for (const status of ["READY", "SENT", "ACCEPTED"] as const)
    q = await changeQuote(userId!, mutation(q), status);
  const results = await Promise.allSettled([
    saveInvoice(userId!, input({ quoteId: q.id })),
    saveInvoice(userId!, input({ quoteId: q.id })),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await prisma.invoice.count({ where: { quoteId: q.id } })).toBe(1);
});
it("settings administration persists issuer fields and omits bank/tax values from audit", async () => {
  const { updateSettingsAction } = await import("@/modules/settings/actions");
  const pipeline = await prisma.pipeline.create({
    data: { name: "Invoice test pipeline", isDefault: true },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({
    companyName: "RDEvolution GbR",
    timezone: "Europe/Berlin",
    currency: "EUR",
    defaultPipelineId: pipeline.id,
    expectedVersion: "1",
    legalCompanyName: "TEST ISSUER",
    street: "Teststraße 10",
    postalCode: "12345",
    city: "Berlin",
    country: "Deutschland",
    vatId: "TEST_VAT",
    taxNumber: "",
    iban: "TEST_BANK",
    bic: "TEST_BIC",
    bankName: "TEST Bank",
    defaultPaymentTermDays: "30",
  }))
    form.set(key, value);
  await expect(updateSettingsAction({ error: null }, form)).rejects.toThrow();
  await prisma.user.update({ where: { id: userId! }, data: { role: "OWNER" } });
  expect(await updateSettingsAction({ error: null }, form)).toEqual({ error: null });
  const settings = await prisma.systemSettings.findFirstOrThrow();
  expect(settings).toMatchObject({
    legalCompanyName: "TEST ISSUER",
    iban: "TEST_BANK",
    defaultPaymentTermDays: 30,
    version: 2,
  });
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "SETTINGS_UPDATED" } });
  expect(JSON.stringify(audit)).not.toContain("TEST_BANK");
  expect(JSON.stringify(audit)).not.toContain("TEST_VAT");
  expect(await updateSettingsAction({ error: null }, form)).toMatchObject({
    error: expect.stringContaining("zwischenzeitlich"),
  });
});
it("allows reopening READY as DRAFT but blocks SENT return", async () => {
  const row = await ready();
  const draft = await changeInvoice(userId!, mutation(row), "DRAFT");
  expect(draft.status).toBe("DRAFT");
  const r = await changeInvoice(userId!, mutation(draft), "READY");
  const s = await changeInvoice(userId!, mutation(r), "SENT");
  await expect(changeInvoice(userId!, mutation(s), "READY")).rejects.toThrow();
});
