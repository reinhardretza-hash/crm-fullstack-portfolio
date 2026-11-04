import { z } from "zod";
import { berlinDayRangeUtc } from "@/lib/timezone";

export const headerField = z
  .string()
  .max(200)
  .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Header dürfen keine Steuerzeichen enthalten.");
export const recipientSchema = headerField
  .pipe(z.string().trim().email("Bitte eine gültige E-Mail-Adresse angeben."))
  .transform((v) => v.toLowerCase());
const contextId = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || undefined)
  .optional();
export const emailContextSchema = z.object({
  contactId: contextId,
  companyId: contextId,
  leadId: contextId,
  dealId: contextId,
});
export const emailSendSchema = emailContextSchema
  .extend({
    invoiceId: contextId,
    invoiceVersion: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().int().positive().optional(),
    ),
    quoteId: contextId,
    quoteVersion: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().int().positive().optional(),
    ),
    idempotencyKey: z.string().uuid("Ungültige Versandanfrage."),
    toEmail: recipientSchema,
    toName: headerField.optional(),
    subject: headerField.pipe(z.string().trim().min(1, "Betreff ist erforderlich.")),
    textBody: z
      .string()
      .max(50_000, "Nachricht ist zu lang.")
      .refine((v) => !!v.trim(), "Nachricht ist erforderlich."),
  })
  .refine((v) => !(v.quoteId && v.invoiceId), "Nur ein Dokument pro Versand erlaubt.");
export type EmailContext = z.infer<typeof emailContextSchema>;
export type EmailSendInput = z.infer<typeof emailSendSchema>;

const dateFilter = (end: boolean) =>
  z
    .string()
    .transform((v, ctx) => {
      if (!v) return undefined;
      const date = new Date(`${v}T12:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== v
      ) {
        ctx.addIssue({ code: "custom", message: "Ungültiges Datum." });
        return z.NEVER;
      }
      const range = berlinDayRangeUtc(date);
      return end ? range.end : range.start;
    })
    .optional();
export const emailFiltersSchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.enum(["DRAFT", "SENDING", "SENT", "FAILED"]).optional(),
    ),
    userId: contextId,
    dateFrom: dateFilter(false),
    dateTo: dateFilter(true),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, "Der Zeitraum ist ungültig.");
export type EmailFilters = z.infer<typeof emailFiltersSchema>;
