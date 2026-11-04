import { describe, it, expect } from "vitest";
import { calculateQuoteItem, calculateQuoteTotals } from "@/modules/quotes/calculations";
import { quoteFormSchema, quoteItemSchema, quoteFiltersSchema } from "@/validations/quote";
import {
  canEditQuote,
  canTransitionQuote,
  effectiveQuoteStatus,
  formatQuoteNumber,
  quoteEmailPrefill,
  QUOTE_STATUSES,
} from "@/modules/quotes/helpers";
import { decimalToScaledInteger, scaledIntegerToDecimal } from "@/lib/money";
import { mergeEmailContext } from "@/modules/email/context";
import { quotePdfData } from "@/modules/quotes/pdf-data";
import type { Quote, QuoteItem } from "@/generated/prisma/client";
const position = {
  title: "Beratung",
  quantity: "1.5",
  unit: "Stunde",
  unitPrice: "100.00",
  taxRateBasisPoints: "1900",
};
const input = {
  companyId: "company",
  assignedUserId: "user",
  issueDate: "2026-10-01",
  validUntil: "2026-11-01",
  taxRateBasisPoints: "1900",
  items: [position],
};
describe("quote validation and money", () => {
  it("parses scaled quantity and cents, strips client totals/currency/status", () => {
    const parsed = quoteFormSchema.parse({
      ...input,
      totalCents: 1,
      currency: "USD",
      status: "ACCEPTED",
    });
    expect(parsed.items[0]).toMatchObject({ quantity: 1500, unitPrice: 10000 });
    expect(parsed).not.toHaveProperty("totalCents");
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("currency");
  });
  it.each([
    { companyId: "" },
    { assignedUserId: "" },
    { items: [] },
    { issueDate: "2026-02-30" },
    { validUntil: "2026-09-01" },
    { taxRateBasisPoints: 2000 },
  ])("rejects invalid quote %o", (extra) =>
    expect(quoteFormSchema.safeParse({ ...input, ...extra }).success).toBe(false),
  );
  it.each([
    { quantity: "0" },
    { quantity: "-1" },
    { quantity: "1.0001" },
    { quantity: "1e3" },
    { unitPrice: "-1" },
    { unitPrice: "1.001" },
    { unitPrice: "3abc" },
    { title: "" },
    { unit: "" },
    { taxRateBasisPoints: 500 },
  ])("rejects invalid item %o", (extra) =>
    expect(quoteItemSchema.safeParse({ ...position, ...extra }).success).toBe(false),
  );
  it.each([
    [1000, 10000, 1900, 10000, 1900, 11900],
    [3250, 10000, 700, 32500, 2275, 34775],
    [1500, 1, 0, 2, 0, 2],
    [1499, 1, 0, 1, 0, 1],
    [1000, 50, 700, 50, 4, 54],
    [1000, 49, 700, 49, 3, 52],
    [1000, 50, 1900, 50, 10, 60],
    [1000, 49, 1900, 49, 9, 58],
  ])(
    "calculates quantity %i price %i rate %i",
    (quantity, unitPriceCents, taxRateBasisPoints, net, tax, total) =>
      expect(calculateQuoteItem({ quantity, unitPriceCents, taxRateBasisPoints })).toEqual({
        lineSubtotalCents: net,
        lineTaxCents: tax,
        lineTotalCents: total,
      }),
  );
  it("sums rounded lines, not a second rounding of aggregate tax", () =>
    expect(
      calculateQuoteTotals(
        [1, 2].map(() =>
          calculateQuoteItem({ quantity: 1000, unitPriceCents: 50, taxRateBasisPoints: 700 }),
        ),
      ),
    ).toEqual({ subtotalCents: 100, taxCents: 8, totalCents: 108 }));
  it("rejects line overflow and aggregate overflow", () => {
    expect(() =>
      calculateQuoteItem({
        quantity: 100000,
        unitPriceCents: 2147483647,
        taxRateBasisPoints: 1900,
      }),
    ).toThrow();
    const item = calculateQuoteItem({
      quantity: 1000,
      unitPriceCents: 1500000000,
      taxRateBasisPoints: 0,
    });
    expect(() => calculateQuoteTotals([item, item])).toThrow();
  });
  it.each(["", "1.234", "1e2", "0x10", "1x", "999999999999999999999999"])(
    "strictly rejects money %s",
    (v) => expect(() => decimalToScaledInteger(v, 2)).toThrow(),
  );
  it("supports decimal comma and formatting roundtrip", () => {
    expect(decimalToScaledInteger("3,25", 3)).toBe(3250);
    expect(scaledIntegerToDecimal(3250, 3)).toBe("3.250");
  });
  it("validates filters including date ordering", () => {
    expect(
      quoteFiltersSchema.safeParse({ dateFrom: "2026-11-01", dateTo: "2026-10-01" }).success,
    ).toBe(false);
    expect(quoteFiltersSchema.parse({ status: "EXPIRED" }).status).toBe("EXPIRED");
  });
});
describe("quote policies and customer allowlist", () => {
  it("formats stable numbers including more than four digits", () => {
    expect(formatQuoteNumber(2026, 1)).toBe("ANG-2026-0001");
    expect(formatQuoteNumber(2026, 10000)).toBe("ANG-2026-10000");
    expect(() => formatQuoteNumber(2026, 0)).toThrow();
  });
  it.each(QUOTE_STATUSES)("restricts editing %s", (status) =>
    expect(canEditQuote(status)).toBe(status === "DRAFT" || status === "READY"),
  );
  it.each([
    ["DRAFT", "READY"],
    ["READY", "DRAFT"],
    ["READY", "SENT"],
    ["SENT", "ACCEPTED"],
    ["SENT", "REJECTED"],
    ["SENT", "CANCELLED"],
    ["EXPIRED", "CANCELLED"],
  ] as const)("allows %s to %s", (a, b) => expect(canTransitionQuote(a, b)).toBe(true));
  it.each([
    ["DRAFT", "ACCEPTED"],
    ["READY", "ACCEPTED"],
    ["ACCEPTED", "DRAFT"],
    ["CANCELLED", "READY"],
    ["REJECTED", "READY"],
    ["EXPIRED", "SENT"],
  ] as const)("blocks %s to %s", (a, b) => expect(canTransitionQuote(a, b)).toBe(false));
  it("expires at Berlin midnight, validity day inclusive", () => {
    const quote = { status: "SENT" as const, validUntil: new Date("2026-10-01") };
    expect(effectiveQuoteStatus(quote, new Date("2026-10-01T21:59:59Z"))).toBe("SENT");
    expect(effectiveQuoteStatus(quote, new Date("2026-10-01T22:00Z"))).toBe("EXPIRED");
    expect(effectiveQuoteStatus({ ...quote, status: "ACCEPTED" }, new Date("2026-10-02"))).toBe(
      "ACCEPTED",
    );
  });
  it("rejects mismatched company/deal/contact context", () =>
    expect(() => mergeEmailContext({ companyId: "A" }, { companyId: "B" })).toThrow(
      "gehören nicht zusammen",
    ));
  it("maps only customer-safe saved values into PDF and email", () => {
    const quote = {
      ...input,
      quoteNumber: "ANG-2026-0001",
      issueDate: new Date(input.issueDate),
      validUntil: new Date(input.validUntil),
      issuerName: "RDEvolution GbR",
      recipientName: "Müller GmbH",
      recipientContact: "Anna Müller",
      recipientAddress: "Teststraße 1",
      currency: "EUR",
      introText: "Intro",
      closingText: "Ende",
      customerNote: "Kundenhinweis",
      internalNote: "PRIVATE_MARKER",
      createdAt: new Date(),
      subtotalCents: 100,
      taxCents: 19,
      totalCents: 119,
      items: [
        {
          position: 1,
          title: "Beratung",
          description: null,
          quantity: 1000,
          unit: "Stunde",
          unitPriceCents: 100,
          taxRateBasisPoints: null,
          lineSubtotalCents: 100,
          lineTaxCents: 19,
          lineTotalCents: 119,
        } as QuoteItem,
      ],
    } as unknown as Quote & { items: QuoteItem[] };
    quote.taxRateBasisPoints = 1900;
    const data = quotePdfData(quote);
    expect(data.items[0].taxRateBasisPoints).toBe(1900);
    expect(JSON.stringify(data)).not.toContain("PRIVATE_MARKER");
    expect(data).not.toHaveProperty("internalNote");
    const prefill = quoteEmailPrefill(quote);
    expect(prefill.subject).toBe("Angebot ANG-2026-0001 – RDEvolution GbR");
    expect(prefill.textBody).toContain("Anna Müller");
    expect(JSON.stringify(prefill)).not.toContain("PRIVATE_MARKER");
  });
});
