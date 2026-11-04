import { it, expect } from "vitest";
import { invoiceFormSchema, invoiceItemSchema, invoiceFiltersSchema } from "@/validations/invoice";
import { calculateQuoteItem, calculateQuoteTotals } from "@/modules/quotes/calculations";
import {
  INVOICE_STATUSES,
  INVOICE_TRANSITIONS,
  canTransitionInvoice,
  canEditInvoice,
  effectiveInvoiceStatus,
  formatInvoiceNumber,
  invoiceEmailPrefill,
  duplicateInvoiceWarning,
} from "@/modules/invoices/helpers";
import { quoteToInvoiceDefaults } from "@/modules/invoices/mapping";
import { issuerIncomplete, issuerSnapshot } from "@/modules/invoices/issuer";
import { settingsFormSchema } from "@/validations/settings";
import { emailSendSchema } from "@/validations/email";
import { emailRequestHash } from "@/modules/email/policy";
import type { Quote, QuoteItem, SystemSettings } from "@/generated/prisma/client";
const item = {
  title: "Beratung",
  quantity: "3.25",
  unit: "Stunde",
  unitPrice: "100.00",
  taxRateBasisPoints: "1900",
};
const input = {
  companyId: "c",
  assignedUserId: "u",
  issueDate: "2026-10-01",
  dueDate: "2026-10-15",
  taxRateBasisPoints: 1900,
  items: [item],
};
it("parses integer quantities/cents and rejects client authority", () => {
  const parsed = invoiceFormSchema.parse({
    ...input,
    status: "PAID",
    currency: "USD",
    totalCents: 1,
  });
  expect(parsed.items[0]).toMatchObject({ quantity: 3250, unitPrice: 10000 });
  expect(parsed).not.toHaveProperty("totalCents");
  expect(parsed).not.toHaveProperty("status");
  expect(parsed).not.toHaveProperty("currency");
});
it.each([
  { companyId: "" },
  { assignedUserId: "" },
  { items: [] },
  { dueDate: "2026-09-30" },
  { dueDate: "2026-02-30" },
  { taxRateBasisPoints: 500 },
  { issueDate: "2201-01-01" },
])("rejects invoice %o", (extra) =>
  expect(invoiceFormSchema.safeParse({ ...input, ...extra }).success).toBe(false),
);
it.each([
  { quantity: "0" },
  { quantity: "-1" },
  { quantity: "1e3" },
  { quantity: "1.0001" },
  { unitPrice: "-1" },
  { unitPrice: "1.001" },
  { unitPrice: "2abc" },
  { title: "" },
  { unit: "" },
  { taxRateBasisPoints: 500 },
])("rejects item %o", (extra) =>
  expect(invoiceItemSchema.safeParse({ ...item, ...extra }).success).toBe(false),
);
it.each([
  [1900, 6175],
  [700, 2275],
  [0, 0],
])("uses shared tax engine %i", (rate, tax) => {
  const line = calculateQuoteItem({
    quantity: 3250,
    unitPriceCents: 10000,
    taxRateBasisPoints: rate,
  });
  expect(line).toMatchObject({
    lineSubtotalCents: 32500,
    lineTaxCents: tax,
    lineTotalCents: 32500 + tax,
  });
  expect(calculateQuoteTotals([line, line]).totalCents).toBe(2 * (32500 + tax));
});
it("rounds half-cent net and tax without floats", () => {
  expect(
    calculateQuoteItem({ quantity: 1500, unitPriceCents: 1, taxRateBasisPoints: 1900 }),
  ).toMatchObject({ lineSubtotalCents: 2, lineTaxCents: 0 });
  expect(
    calculateQuoteItem({ quantity: 1000, unitPriceCents: 50, taxRateBasisPoints: 700 })
      .lineTaxCents,
  ).toBe(4);
});
it.each(INVOICE_STATUSES)("central matrix and immutable status %s", (from) => {
  for (const to of INVOICE_STATUSES)
    expect(canTransitionInvoice(from, to)).toBe(INVOICE_TRANSITIONS[from].includes(to));
  expect(canEditInvoice(from)).toBe(["DRAFT", "READY"].includes(from));
});
it.each(INVOICE_STATUSES)("only SENT is dynamically overdue %s", (status) => {
  expect(
    effectiveInvoiceStatus(
      { status, dueDate: new Date("2026-10-01") },
      new Date("2026-10-02T08:00Z"),
    ),
  ).toBe(status === "SENT" ? "OVERDUE" : status);
});
it("Berlin due day includes midnight boundary", () => {
  const inv = { status: "SENT" as const, dueDate: new Date("2026-10-01") };
  expect(effectiveInvoiceStatus(inv, new Date("2026-10-01T21:59:59Z"))).toBe("SENT");
  expect(effectiveInvoiceStatus(inv, new Date("2026-10-01T22:00Z"))).toBe("OVERDUE");
});
it("formats growing independent invoice numbers", () => {
  expect(formatInvoiceNumber(2026, 1)).toBe("RE-2026-0001");
  expect(formatInvoiceNumber(2026, 10000)).toBe("RE-2026-10000");
  expect(() => formatInvoiceNumber(2026, 0)).toThrow();
});
it("maps independent quote positions without IDs or private notes", () => {
  const quote = {
    companyId: "c",
    assignedUserId: "u",
    contactId: null,
    dealId: null,
    taxRateBasisPoints: 1900,
    internalNote: "PRIVATE",
    customerNote: "Public",
    items: [
      { ...item, id: "old", quantity: 3250, unitPriceCents: 10000, taxRateBasisPoints: null },
    ],
  } as unknown as Quote & { items: QuoteItem[] };
  const defaults = quoteToInvoiceDefaults(quote);
  expect(defaults.items[0]).toMatchObject({
    quantity: "3.250",
    unitPrice: "100.00",
    taxRateBasisPoints: "1900",
  });
  expect(defaults.items[0]).not.toHaveProperty("id");
  expect(JSON.stringify(defaults)).not.toContain("PRIVATE");
});
it("duplicate warning depends on active invoice count", () => {
  expect(duplicateInvoiceWarning(0)).toBeNull();
  expect(duplicateInvoiceWarning(1)).toContain("bestätigen");
});
it("issuer snapshot allowlist and missing legal data", () => {
  const settings = {
    companyName: "RDEvolution GbR",
    legalCompanyName: "",
    street: "",
    postalCode: "",
    city: "",
    country: "",
    vatId: "",
    taxNumber: "",
    iban: "",
    bic: "",
    bankName: "",
    defaultPaymentTermDays: 14,
  } as SystemSettings;
  const snapshot = issuerSnapshot(settings);
  expect(issuerIncomplete(snapshot)).toBe(true);
  expect(snapshot.name).toBe("RDEvolution GbR");
  expect(
    issuerIncomplete({
      ...snapshot,
      street: "Test",
      postalCode: "12345",
      city: "Berlin",
      taxNumber: "TEST_ONLY",
    }),
  ).toBe(false);
});
it.each([-1, 366, 1.5])("rejects payment term %i", (days) =>
  expect(
    settingsFormSchema.safeParse({
      companyName: "CRM",
      timezone: "Europe/Berlin",
      currency: "EUR",
      defaultPipelineId: "p",
      expectedVersion: 1,
      defaultPaymentTermDays: days,
    }).success,
  ).toBe(false),
);
it("settings reject header control characters", () =>
  expect(
    settingsFormSchema.safeParse({
      companyName: "CRM",
      timezone: "Europe/Berlin",
      currency: "EUR",
      defaultPipelineId: "p",
      expectedVersion: 1,
      vatId: "x\r\nInjected",
    }).success,
  ).toBe(false));
it("email prefill excludes arbitrary private fields", () => {
  const prefill = invoiceEmailPrefill({
    invoiceNumber: "RE-2026-0001",
    issuerName: "RDEvolution GbR",
    recipientContact: "Anna",
  });
  expect(prefill.subject).toBe("Rechnung RE-2026-0001 – RDEvolution GbR");
  expect(prefill.textBody).toContain("RE-2026-0001");
});
it("invoice hash is distinct while preserving quote hashes", () => {
  const mail = {
    idempotencyKey: "b1255cb3-d410-4ed1-a900-630903ffb421",
    toEmail: "recipient@example.invalid",
    subject: "Test",
    textBody: "Text",
    quoteId: "same",
    quoteVersion: 1,
  };
  expect(emailRequestHash(mail)).not.toBe(
    emailRequestHash({
      ...mail,
      quoteId: undefined,
      quoteVersion: undefined,
      invoiceId: "same",
      invoiceVersion: 1,
    }),
  );
  expect(
    emailSendSchema.safeParse({ ...mail, invoiceId: "invoice", invoiceVersion: 1 }).success,
  ).toBe(false);
});
it("validates both invoice and due date filters", () => {
  expect(
    invoiceFiltersSchema.safeParse({ dueFrom: "2026-10-02", dueTo: "2026-10-01" }).success,
  ).toBe(false);
  expect(invoiceFiltersSchema.parse({ status: "OVERDUE", overdue: "yes" })).toMatchObject({
    status: "OVERDUE",
    overdue: "yes",
  });
});
