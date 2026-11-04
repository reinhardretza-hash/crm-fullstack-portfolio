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
import { saveQuote, changeQuote, QUOTE_CONFLICT_MESSAGE } from "@/modules/quotes/service";
import { getQuote, listQuotes } from "@/modules/quotes/queries";
import { quoteFiltersSchema } from "@/validations/quote";
import { saveQuoteAction, changeQuoteAction } from "@/modules/quotes/actions";
import { sendEmail } from "@/modules/email/service";
import { quoteEmailPrefill } from "@/modules/quotes/helpers";
import { GET } from "@/app/(dashboard)/quotes/[id]/pdf/route";
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
  validUntil: "2199-12-31",
  taxRateBasisPoints: 1900,
  items: [position()],
  introText: "Intro",
  closingText: "Ende",
  customerNote: "Kundenhinweis",
  internalNote: "QUOTE_INTERNAL_ONLY",
  ...extra,
});
const mutation = (quote: { id: string; version: number }) => ({
  id: quote.id,
  expectedVersion: quote.version,
});
const page = { page: 1, pageSize: 25 as const };
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  smtp.getSmtpConfig.mockReturnValue({
    fromEmail: "sender@example.invalid",
    fromName: "RDEvolution GbR",
  });
  smtp.sendSmtpMail.mockResolvedValue("<quote@example.invalid>");
  userId = (
    await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: randomUUID(),
        firstName: "Quote",
        lastName: "Tester",
        role: "USER",
      },
    })
  ).id;
  companyId = (
    await prisma.company.create({
      data: {
        name: "Müller Quote GmbH",
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
        name: "Quote Deal",
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
  return changeQuote(userId!, mutation(await saveQuote(userId!, input())), "READY");
}
async function sent() {
  return changeQuote(userId!, mutation(await ready()), "SENT");
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
function mail(quote: Awaited<ReturnType<typeof ready>>, extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    quoteId: quote.id,
    quoteVersion: quote.version,
    toEmail: "recipient@example.invalid",
    ...quoteEmailPrefill(quote),
    ...extra,
  };
}
it("creates DRAFT with relationships, snapshots and canonical totals", async () => {
  const quote = await saveQuote(
    userId!,
    input({ totalCents: 1, currency: "USD", status: "ACCEPTED" }),
  );
  const row = await getQuote(quote.id);
  expect(row).toMatchObject({
    status: "DRAFT",
    companyId,
    contactId,
    dealId,
    currency: "EUR",
    subtotalCents: 15000,
    taxCents: 2850,
    totalCents: 17850,
    recipientName: "Müller Quote GmbH",
    recipientContact: "Anna Müller",
    version: 1,
  });
  expect(row?.items[0]).toMatchObject({
    quantity: 1500,
    unitPriceCents: 10000,
    position: 1,
    lineTotalCents: 17850,
  });
});
it("creates manually without contact/deal", async () =>
  expect(await saveQuote(userId!, input({ contactId: "", dealId: "" }))).toMatchObject({
    contactId: null,
    dealId: null,
    status: "DRAFT",
  }));
it("derives contact from deal", async () =>
  expect(await saveQuote(userId!, input({ contactId: "" }))).toMatchObject({ contactId }));
it("blocks inconsistent deal company", async () => {
  const other = await prisma.company.create({ data: { name: "Other" } });
  await expect(saveQuote(userId!, input({ companyId: other.id }))).rejects.toThrow(
    "gehören nicht zusammen",
  );
});
it("blocks inconsistent contact company", async () => {
  const other = await prisma.company.create({ data: { name: "Other" } });
  await expect(saveQuote(userId!, input({ dealId: "", companyId: other.id }))).rejects.toThrow(
    "gehören nicht zusammen",
  );
});
it.each(["company", "contact", "deal"] as const)("blocks deleted %s", async (model) => {
  if (model === "company")
    await prisma.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } });
  if (model === "contact")
    await prisma.contact.update({ where: { id: contactId }, data: { deletedAt: new Date() } });
  if (model === "deal")
    await prisma.deal.update({ where: { id: dealId }, data: { deletedAt: new Date() } });
  await expect(saveQuote(userId!, input())).rejects.toThrow();
});
it("blocks inactive actor and assignee", async () => {
  await prisma.user.update({ where: { id: userId! }, data: { isActive: false } });
  await expect(saveQuote(userId!, input())).rejects.toThrow();
});
it("adds, edits, removes and reorders positions atomically with stable item IDs", async () => {
  const quote = await saveQuote(
    userId!,
    input({
      items: [
        position(),
        position({ title: "Zweite", quantity: "3.25", unitPrice: "2.00", taxRateBasisPoints: 700 }),
      ],
    }),
  );
  const original = await getQuote(quote.id);
  const a = original!.items[0],
    b = original!.items[1];
  const updated = await saveQuote(
    userId!,
    input({
      items: [
        position({
          id: b.id,
          title: "Zweite",
          quantity: "3.25",
          unitPrice: "2.00",
          taxRateBasisPoints: 700,
        }),
        position({ id: a.id, title: "Bearbeitet", quantity: "2" }),
      ],
    }),
    mutation(quote),
  );
  const row = await getQuote(quote.id);
  expect(row?.items.map((i) => i.id)).toEqual([b.id, a.id]);
  expect(row?.items.map((i) => i.position)).toEqual([1, 2]);
  expect(row?.items[0].createdAt).toEqual(b.createdAt);
  expect(row?.totalCents).toBe(24496);
  const last = await saveQuote(
    userId!,
    input({
      items: [
        position({ id: a.id }),
        position({ title: "Neu", taxRateBasisPoints: 0, unitPrice: "1.00" }),
      ],
    }),
    mutation(updated),
  );
  expect((await getQuote(last.id))?.items.map((i) => i.title)).toEqual(["Beratung", "Neu"]);
  expect(await prisma.quoteItem.findUnique({ where: { id: b.id } })).toBeNull();
});
it("rejects foreign and duplicated item IDs without changing totals", async () => {
  const a = await saveQuote(userId!, input()),
    b = await saveQuote(userId!, input());
  const item = (await getQuote(b.id))!.items[0];
  await expect(
    saveQuote(userId!, input({ items: [position({ id: item.id })] }), mutation(a)),
  ).rejects.toThrow("Angebotspositionen");
  expect((await getQuote(a.id))?.version).toBe(1);
  const own = (await getQuote(a.id))!.items[0];
  await expect(
    saveQuote(
      userId!,
      input({ items: [position({ id: own.id }), position({ id: own.id })] }),
      mutation(a),
    ),
  ).rejects.toThrow("Angebotspositionen");
});
it("allocates 20 unique consecutive numbers under real concurrency", async () => {
  const quotes = await Promise.all(Array.from({ length: 20 }, () => saveQuote(userId!, input())));
  const numbers = quotes.map((q) => Number(q.quoteNumber.split("-")[2])).sort((a, b) => a - b);
  expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(new Set(quotes.map((q) => q.quoteNumber)).size).toBe(20);
  expect((await prisma.quoteNumberSequence.findMany())[0].lastNumber).toBe(20);
});
it("rolls back number allocation together with failed audit/activity", async () => {
  const spy = vi
    .spyOn(activityLog, "logActivity")
    .mockRejectedValueOnce(new Error("fixture rollback"));
  await expect(saveQuote(userId!, input())).rejects.toThrow("fixture rollback");
  spy.mockRestore();
  expect(await prisma.quote.count()).toBe(0);
  expect(await prisma.quoteNumberSequence.count()).toBe(0);
  expect((await saveQuote(userId!, input())).quoteNumber).toMatch(/-0001$/);
});
it("exactly one parallel OCC item update succeeds", async () => {
  const quote = await saveQuote(userId!, input());
  const results = await Promise.allSettled([
    saveQuote(userId!, input({ items: [position({ quantity: "2" })] }), mutation(quote)),
    saveQuote(userId!, input({ items: [position({ quantity: "3" })] }), mutation(quote)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await getQuote(quote.id))?.version).toBe(2);
});
it("exactly one concurrent status transition succeeds", async () => {
  const quote = await ready();
  const results = await Promise.allSettled([
    changeQuote(userId!, mutation(quote), "SENT"),
    changeQuote(userId!, mutation(quote), "DRAFT"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("DRAFT READY DRAFT READY SENT ACCEPTED keeps Deal OPEN", async () => {
  let quote = await ready();
  quote = await changeQuote(userId!, mutation(quote), "DRAFT");
  quote = await changeQuote(userId!, mutation(quote), "READY");
  quote = await changeQuote(userId!, mutation(quote), "SENT");
  quote = await changeQuote(userId!, mutation(quote), "ACCEPTED");
  expect(quote.sentAt).not.toBeNull();
  expect(quote.acceptedAt).not.toBeNull();
  expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).status).toBe("OPEN");
});
it("SENT REJECTED preserves Deal lost reason", async () => {
  const quote = await changeQuote(userId!, mutation(await sent()), "REJECTED");
  expect(quote.rejectedAt).not.toBeNull();
  expect((await prisma.deal.findUniqueOrThrow({ where: { id: dealId } })).lostReason).toBeNull();
});
it.each(["DRAFT", "READY", "SENT"] as const)("cancels %s", async (status) => {
  const quote =
    status === "DRAFT"
      ? await saveQuote(userId!, input())
      : status === "READY"
        ? await ready()
        : await sent();
  expect((await changeQuote(userId!, mutation(quote), "CANCELLED")).status).toBe("CANCELLED");
});
it.each(["SENT", "ACCEPTED", "REJECTED", "CANCELLED"] as const)(
  "content is immutable for %s",
  async (status) => {
    let quote = await sent();
    if (status !== "SENT") quote = await changeQuote(userId!, mutation(quote), status);
    await expect(saveQuote(userId!, input(), mutation(quote))).rejects.toThrow("schreibgeschützt");
  },
);
it("rejects READY with no positions even for legacy/corrupt draft", async () => {
  const quote = await saveQuote(userId!, input());
  await prisma.quoteItem.deleteMany({ where: { quoteId: quote.id } });
  await expect(changeQuote(userId!, mutation(quote), "READY")).rejects.toThrow("Position");
});
it("rejects skipping workflow and stale version", async () => {
  const quote = await saveQuote(userId!, input());
  await expect(changeQuote(userId!, mutation(quote), "ACCEPTED")).rejects.toThrow("Angebotsstatus");
  await changeQuote(userId!, mutation(quote), "READY");
  await expect(saveQuote(userId!, input(), mutation(quote))).rejects.toThrow(
    QUOTE_CONFLICT_MESSAGE,
  );
});
it("soft deletes DRAFT, hides it and never reuses number", async () => {
  const quote = await saveQuote(userId!, input());
  await changeQuote(userId!, mutation(quote), "DELETE");
  expect(await getQuote(quote.id)).toBeNull();
  expect((await listQuotes(quoteFiltersSchema.parse({}), page)).totalCount).toBe(0);
  expect((await saveQuote(userId!, input())).quoteNumber).toMatch(/-0002$/);
});
it.each(["SENT", "ACCEPTED"] as const)("blocks delete %s", async (status) => {
  let quote = await sent();
  if (status === "ACCEPTED") quote = await changeQuote(userId!, mutation(quote), "ACCEPTED");
  await expect(changeQuote(userId!, mutation(quote), "DELETE")).rejects.toThrow("Nur Angebote");
});
it("derives expiry consistently in filters and blocks acceptance/content changes", async () => {
  const quote = await sent();
  await prisma.quote.update({
    where: { id: quote.id },
    data: { issueDate: new Date("2020-01-01"), validUntil: new Date("2020-02-01") },
  });
  expect((await listQuotes(quoteFiltersSchema.parse({ status: "EXPIRED" }), page)).totalCount).toBe(
    1,
  );
  expect((await listQuotes(quoteFiltersSchema.parse({ status: "SENT" }), page)).totalCount).toBe(0);
  await expect(changeQuote(userId!, mutation(quote), "ACCEPTED")).rejects.toThrow();
  await expect(saveQuote(userId!, input(), mutation(quote))).rejects.toThrow("schreibgeschützt");
  expect((await changeQuote(userId!, mutation(quote), "CANCELLED")).status).toBe("CANCELLED");
});
it("filters search across number/company/contact/deal and paginates with deterministic sort", async () => {
  const quote = await saveQuote(userId!, input());
  for (const q of [quote.quoteNumber, "Müller Quote", "Anna", "Quote Deal"])
    expect((await listQuotes(quoteFiltersSchema.parse({ q }), page)).totalCount).toBe(1);
  expect(
    (
      await listQuotes(
        quoteFiltersSchema.parse({
          companyId,
          userId: userId!,
          dateFrom: "2026-10-01",
          dateTo: "2026-10-01",
          validity: "valid",
          sort: "total",
          direction: "asc",
        }),
        page,
      )
    ).quotes[0].id,
  ).toBe(quote.id);
  expect((await listQuotes(quoteFiltersSchema.parse({ q: "missing" }), page)).totalCount).toBe(0);
  expect(
    (await listQuotes(quoteFiltersSchema.parse({}), { ...page, page: 2 })).quotes,
  ).toHaveLength(0);
});
it("writes compact activity and audit without private/customer content", async () => {
  const quote = await ready();
  const activities = await prisma.activity.findMany({ where: { quoteId: quote.id } });
  expect(activities.map((a) => a.type)).toEqual(
    expect.arrayContaining(["QUOTE_CREATED", "QUOTE_READY"]),
  );
  expect(activities[0]).toMatchObject({ companyId, contactId, dealId });
  expect(JSON.stringify(activities)).toContain(quote.quoteNumber);
  const audit = await prisma.auditLog.findMany({ where: { entityId: quote.id } });
  expect(audit.map((a) => a.action)).toEqual(
    expect.arrayContaining(["QUOTE_CREATED", "QUOTE_STATUS_CHANGED"]),
  );
  expect(JSON.stringify(audit)).not.toContain("QUOTE_INTERNAL_ONLY");
  expect(JSON.stringify(audit)).not.toContain("Leistungsumfang");
});
it("PDF endpoint requires auth, returns no-store inline/download and hides deleted/missing IDs", async () => {
  const quote = await saveQuote(userId!, input());
  const args = { params: Promise.resolve({ id: quote.id }) };
  const request = new Request(`http://localhost/quotes/${quote.id}/pdf`);
  const response = await GET(request, args);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-disposition")).toBe(
    `inline; filename="${quote.quoteNumber}.pdf"`,
  );
  const text = await pdfText(Buffer.from(await response.arrayBuffer()));
  expect(text).toContain("Müller Quote GmbH");
  expect(text).toContain("Beratung");
  expect(text).toContain("178,50");
  expect(text).not.toContain("QUOTE_INTERNAL_ONLY");
  expect(
    (await GET(new Request(`${request.url}?download=1`), args)).headers.get("content-disposition"),
  ).toContain("attachment;");
  const saved = userId;
  userId = null;
  expect((await GET(request, args)).status).toBe(401);
  await expect(getQuote(quote.id)).rejects.toThrow("AUTH_REQUIRED");
  userId = saved;
  await changeQuote(userId!, mutation(quote), "DELETE");
  expect((await GET(request, args)).status).toBe(404);
  expect((await GET(request, { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);
});
it("PDF snapshot survives changes to Company, Contact and Settings after SENT", async () => {
  const quote = await sent();
  await prisma.company.update({
    where: { id: companyId },
    data: { name: "Changed Company", street: "Changed Address" },
  });
  await prisma.contact.update({ where: { id: contactId }, data: { lastName: "Changed Contact" } });
  await prisma.systemSettings.update({
    where: { singleton: true },
    data: { companyName: "Changed Issuer" },
  });
  const response = await GET(new Request(`http://localhost/quotes/${quote.id}/pdf`), {
    params: Promise.resolve({ id: quote.id }),
  });
  const text = await pdfText(Buffer.from(await response.arrayBuffer()));
  expect(text).toContain("Müller Quote GmbH");
  expect(text).toContain("RDEvolution GbR");
  expect(text).not.toContain("Changed");
});
it("SMTP success attaches generated PDF, preserves quote relation and sets SENT exactly once", async () => {
  const quote = await ready(),
    request = mail(quote);
  const email = await sendEmail(userId!, request);
  expect(email).toMatchObject({ status: "SENT", quoteId: quote.id, companyId, contactId, dealId });
  const call = smtp.sendSmtpMail.mock.calls[0][0];
  expect(call.toEmail).toBe("recipient@example.invalid");
  expect(call.subject).toBe(`Angebot ${quote.quoteNumber} – RDEvolution GbR`);
  expect(call.quoteAttachment.filename).toBe(`${quote.quoteNumber}.pdf`);
  expect(await pdfText(call.quoteAttachment.content)).not.toContain("QUOTE_INTERNAL_ONLY");
  expect(call.textBody).not.toContain("QUOTE_INTERNAL_ONLY");
  expect((await getQuote(quote.id))?.status).toBe("SENT");
  expect((await sendEmail(userId!, request)).id).toBe(email.id);
  expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
  expect(
    await prisma.activity.findMany({ where: { quoteId: quote.id, type: "QUOTE_SENT" } }),
  ).toHaveLength(1);
});
it("SMTP failure leaves READY with FAILED related email and permits subsequent editing", async () => {
  const quote = await ready();
  smtp.sendSmtpMail.mockRejectedValue({ code: "ECONNREFUSED" });
  const email = await sendEmail(userId!, mail(quote));
  expect(email).toMatchObject({ status: "FAILED", quoteId: quote.id });
  const row = (await getQuote(quote.id))!;
  expect(row.status).toBe("READY");
  expect(row.sentAt).toBeNull();
  await expect(saveQuote(userId!, input(), mutation(row))).resolves.toMatchObject({
    status: "READY",
  });
});
it("blocks draft, expired, stale and conflicting-context mail before SMTP", async () => {
  const draft = await saveQuote(userId!, input());
  await expect(sendEmail(userId!, mail(draft))).rejects.toThrow("bereite");
  const quote = await changeQuote(userId!, mutation(draft), "READY");
  await expect(sendEmail(userId!, mail(quote, { quoteVersion: 1 }))).rejects.toThrow(
    QUOTE_CONFLICT_MESSAGE,
  );
  await expect(sendEmail(userId!, mail(quote, { companyId: "foreign" }))).rejects.toThrow(
    "gehören nicht zusammen",
  );
  await prisma.quote.update({
    where: { id: quote.id },
    data: { issueDate: new Date("2020-01-01"), validUntil: new Date("2020-02-01") },
  });
  await expect(sendEmail(userId!, mail(quote))).rejects.toThrow("bereite");
  expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
});
it("an in-flight send blocks edits and status changes, including different users", async () => {
  let entered!: () => void, finish!: (v: string) => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  smtp.sendSmtpMail.mockImplementation(() => {
    entered();
    return new Promise<string>((resolve) => (finish = resolve));
  });
  const quote = await ready();
  const sending = sendEmail(userId!, mail(quote));
  await started;
  const reserved = (await getQuote(quote.id))!;
  await expect(saveQuote(userId!, input(), mutation(reserved))).rejects.toThrow("Versand");
  await expect(changeQuote(userId!, mutation(reserved), "CANCELLED")).rejects.toThrow("Versand");
  await expect(sendEmail(userId!, mail(reserved))).rejects.toThrow("Versand");
  finish("<fixture@example.invalid>");
  expect((await sending).status).toBe("SENT");
});
it("independent mail keys cannot send a quote twice concurrently", async () => {
  const quote = await ready();
  const results = await Promise.allSettled([
    sendEmail(userId!, mail(quote)),
    sendEmail(userId!, mail(quote)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
});
it("failed finalization retains SENDING and blocks quote mutations to avoid resend", async () => {
  const quote = await ready();
  const spy = vi.spyOn(activityLog, "logActivity").mockImplementationOnce(async () => {
    throw new Error("fixture finalization failure");
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const email = await sendEmail(userId!, mail(quote));
  spy.mockRestore();
  expect(email.status).toBe("SENDING");
  const row = (await getQuote(quote.id))!;
  expect(row.status).toBe("READY");
  await expect(saveQuote(userId!, input(), mutation(row))).rejects.toThrow("Versand");
  expect(log).toHaveBeenCalledWith(expect.stringContaining("EMAIL_FINALIZATION_FAILED"));
});
it("server actions authenticate and do not swallow redirect on success", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries(input()))
    form.set(key, key === "items" ? JSON.stringify(value) : String(value));
  await expect(saveQuoteAction(null, 0, { error: null }, form)).rejects.toThrow(
    "REDIRECT:/quotes/",
  );
  const quote = (await prisma.quote.findMany())[0];
  await expect(
    changeQuoteAction(quote.id, quote.version, "READY", { error: null }),
  ).rejects.toThrow(`REDIRECT:/quotes/${quote.id}`);
  userId = null;
  await expect(saveQuoteAction(null, 0, { error: null }, form)).rejects.toThrow("AUTH_REQUIRED");
});
it("database protects values, number immutability and foreign keys directly", async () => {
  const quote = await saveQuote(userId!, input());
  await expect(
    prisma.quote.update({ where: { id: quote.id }, data: { quoteNumber: "ANG-2026-9999" } }),
  ).rejects.toThrow();
  await expect(
    prisma.quote.update({ where: { id: quote.id }, data: { version: 0 } }),
  ).rejects.toThrow();
  await expect(
    prisma.quote.update({ where: { id: quote.id }, data: { totalCents: -1 } }),
  ).rejects.toThrow();
  await expect(
    prisma.quote.update({ where: { id: quote.id }, data: { validUntil: new Date("2025-01-01") } }),
  ).rejects.toThrow();
  const item = (await prisma.quoteItem.findMany())[0];
  await expect(
    prisma.quoteItem.update({ where: { id: item.id }, data: { quantity: 0 } }),
  ).rejects.toThrow();
  await expect(
    prisma.quoteItem.update({ where: { id: item.id }, data: { position: 0 } }),
  ).rejects.toThrow();
  await expect(prisma.company.delete({ where: { id: companyId } })).rejects.toThrow();
  await expect(
    prisma.quote.update({ where: { id: quote.id }, data: { companyId: "missing" } }),
  ).rejects.toThrow();
});
it("database requires a non-null positive email quote version", async () => {
  const quote = await saveQuote(userId!, input());
  const email = await prisma.emailMessage.create({
    data: {
      status: "FAILED",
      idempotencyKey: randomUUID(),
      requestHash: randomUUID(),
      fromEmail: "sender@example.invalid",
      toEmail: "recipient@example.invalid",
      subject: "Constraint fixture",
      textBody: "Fixture",
      sentByUserId: userId!,
    },
  });
  await expect(
    prisma.emailMessage.update({
      where: { id: email.id },
      data: { quoteId: quote.id, quoteVersion: null },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.emailMessage.update({
      where: { id: email.id },
      data: { quoteId: quote.id, quoteVersion: 0 },
    }),
  ).rejects.toThrow();
  await expect(
    prisma.emailMessage.update({
      where: { id: email.id },
      data: { quoteId: quote.id, quoteVersion: 1 },
    }),
  ).resolves.toMatchObject({ quoteId: quote.id, quoteVersion: 1 });
});

it.each(["ETIMEDOUT", "ESOCKET", "unclassified"])(
  "keeps ambiguous %s quote mail reserved against edit or a second send",
  async (code) => {
    const quote = await ready();
    smtp.sendSmtpMail.mockRejectedValue({ code });
    const request = mail(quote);
    const email = await sendEmail(userId!, request);
    expect(email.status).toBe("SENDING");
    expect((await sendEmail(userId!, request)).id).toBe(email.id);
    const row = (await getQuote(quote.id))!;
    await expect(saveQuote(userId!, input(), mutation(row))).rejects.toThrow("Versand");
    await expect(sendEmail(userId!, mail(row))).rejects.toThrow("Versand");
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
  },
);
