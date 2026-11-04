import { z } from "zod";
import { isCalendarDate } from "@/lib/timezone";
import { decimalToScaledInteger } from "@/lib/money";
import { QUOTE_STATUSES } from "@/modules/quotes/helpers";
const id = z.string().trim().min(1).max(100);
const optionalId = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || undefined)
  .optional();
const date = z
  .string()
  .refine(
    (v) => isCalendarDate(v) && v >= "1900-01-01" && v <= "2200-12-31",
    "Bitte ein gültiges Datum angeben.",
  );
const tax = z.coerce
  .number()
  .int()
  .refine((v) => [0, 700, 1900].includes(v), "Erlaubte Steuersätze: 0, 7 oder 19 Prozent.");
const decimal = (digits: number, positive: boolean) =>
  z
    .string()
    .max(30)
    .transform((v, ctx) => {
      try {
        const value = decimalToScaledInteger(v, digits);
        if (positive && value <= 0) throw new Error();
        return value;
      } catch {
        ctx.addIssue({
          code: "custom",
          message: positive
            ? "Menge muss positiv sein (maximal drei Nachkommastellen)."
            : "Preis muss mindestens 0 sein (maximal zwei Nachkommastellen).",
        });
        return z.NEVER;
      }
    });
const text = (length: number) =>
  z
    .string()
    .trim()
    .max(length)
    .transform((v) => v || null)
    .optional();
export const quoteItemSchema = z.object({
  id: optionalId,
  title: z.string().trim().min(1, "Positionstitel ist erforderlich.").max(200),
  description: text(2000),
  quantity: decimal(3, true),
  unit: z.string().trim().min(1).max(25),
  unitPrice: decimal(2, false),
  taxRateBasisPoints: z.preprocess((v) => (v === "" ? undefined : v), tax.optional()),
});
export const quoteFormSchema = z
  .object({
    companyId: id,
    contactId: optionalId,
    dealId: optionalId,
    assignedUserId: id,
    issueDate: date,
    validUntil: date,
    taxRateBasisPoints: tax,
    introText: text(4000),
    closingText: text(4000),
    customerNote: text(4000),
    internalNote: text(4000),
    items: z.array(quoteItemSchema).min(1, "Mindestens eine Position ist erforderlich.").max(100),
  })
  .refine(
    (v) => v.validUntil >= v.issueDate,
    "Gültig bis darf nicht vor dem Angebotsdatum liegen.",
  );
export const quoteMutationSchema = z.object({
  id,
  expectedVersion: z.coerce.number().int().positive(),
});
export const quoteFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    companyId: optionalId,
    userId: optionalId,
    status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(QUOTE_STATUSES).optional()),
    dateFrom: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    dateTo: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    validity: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["valid", "expired"]).optional(),
    ),
    sort: z.enum(["updated", "number", "total", "validUntil"]).default("updated"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, "Ungültiger Zeitraum.");
export type QuoteFilters = z.infer<typeof quoteFiltersSchema>;
