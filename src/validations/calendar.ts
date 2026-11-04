import { z } from "zod";
import { emailContextSchema } from "./email";
import { addCalendarDays, isCalendarDate, strictBerlinTimeToUtc } from "@/lib/timezone";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || undefined)
    .optional();
export const calendarDateSchema = z
  .string()
  .refine(
    (v) => isCalendarDate(v) && v >= "1900-01-01" && v <= "2200-12-31",
    "Ungültiges Datum (1900–2200).",
  );
export const eventFormSchema = emailContextSchema
  .extend({
    title: z.string().trim().min(1, "Titel ist erforderlich.").max(200),
    description: optionalText(10000),
    location: optionalText(300),
    assignedUserId: z.string().min(1, "Verantwortlicher ist erforderlich.").max(100),
    taskId: optionalText(100),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    allDay: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  })
  .transform((v, ctx) => {
    try {
      const startsAt = strictBerlinTimeToUtc(v.startDate, v.allDay ? "00:00" : v.startTime || "");
      const endsAt = strictBerlinTimeToUtc(
        v.allDay ? addCalendarDays(v.endDate, 1) : v.endDate,
        v.allDay ? "00:00" : v.endTime || "",
      );
      if ((v.allDay && v.endDate < v.startDate) || endsAt <= startsAt)
        throw new Error("Ende muss nach dem Beginn liegen.");
      const { startDate, endDate, startTime, endTime, ...data } = v;
      void startDate;
      void endDate;
      void startTime;
      void endTime;
      return { ...data, startsAt, endsAt };
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Ungültige Zeit.",
      });
      return z.NEVER;
    }
  });
export const eventMutationSchema = z.object({
  id: z.string().min(1).max(100),
  expectedVersion: z.number().int().positive(),
});
export const calendarFiltersSchema = z
  .object({
    q: optionalText(200),
    userId: optionalText(100),
    status: z.preprocess(
      (v) => v || undefined,
      z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
    ),
    crmType: z.preprocess(
      (v) => v || undefined,
      z.enum(["company", "contact", "lead", "deal", "none"]).optional(),
    ),
    dateFrom: z.preprocess((v) => v || undefined, calendarDateSchema.optional()),
    dateTo: z.preprocess((v) => v || undefined, calendarDateSchema.optional()),
    scope: z.enum(["mine", "all"]).default("all"),
    view: z.enum(["month", "agenda"]).default("month"),
    date: calendarDateSchema.optional(),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, "Ungültiger Zeitraum.");
export type CalendarFilters = z.infer<typeof calendarFiltersSchema>;
