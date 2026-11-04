import { z } from "zod";
import { isCalendarDate } from "@/lib/timezone";
import { quoteItemSchema as invoiceItemSchema } from "./quote";
import { INVOICE_STATUSES } from "@/modules/invoices/helpers";
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
const text = (length: number) =>
  z
    .string()
    .trim()
    .max(length)
    .transform((v) => v || null)
    .optional();
export { quoteItemSchema as invoiceItemSchema } from "./quote";
export const invoiceFormSchema = z
  .object({
    quoteId: optionalId,
    confirmDuplicate: z.preprocess((v) => v === "on" || v === true, z.boolean()).default(false),
    companyId: id,
    contactId: optionalId,
    dealId: optionalId,
    assignedUserId: id,
    issueDate: date,
    dueDate: date,
    taxRateBasisPoints: tax,
    introText: text(4000),
    closingText: text(4000),
    customerNote: text(4000),
    internalNote: text(4000),
    items: z.array(invoiceItemSchema).min(1, "Mindestens eine Position ist erforderlich.").max(100),
  })
  .refine((v) => v.dueDate >= v.issueDate, "Fälligkeit darf nicht vor dem Rechnungsdatum liegen.");
export const invoiceMutationSchema = z.object({
  id,
  expectedVersion: z.coerce.number().int().positive(),
});
export const invoiceFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    companyId: optionalId,
    userId: optionalId,
    status: z.preprocess((v) => (v === "" ? undefined : v), z.enum(INVOICE_STATUSES).optional()),
    dateFrom: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    dueFrom: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    dueTo: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    dateTo: z.preprocess((v) => (v === "" ? undefined : v), date.optional()),
    overdue: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["yes", "no"]).optional()),
    sort: z.enum(["updated", "number", "total", "dueDate"]).default("updated"),
    direction: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (v) =>
      (!v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo) &&
      (!v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo),
    "Ungültiger Zeitraum.",
  );
export type InvoiceFilters = z.infer<typeof invoiceFiltersSchema>;
