import { z } from "zod";
import { berlinDayRangeUtc } from "@/lib/timezone";
import { ACTIVITY_CATEGORIES, ACTIVITY_TYPES } from "@/modules/activity/catalog";

const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || undefined);

// Ungültige/manipulierte URL-Werte fallen auf "kein Filter" zurück statt die
// Seite zu brechen.
const optionalDate = (edge: "start" | "end") =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return undefined;
      }
      return berlinDayRangeUtc(new Date(`${value}T12:00:00Z`))[edge];
    });

export const activityFiltersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => value || undefined),
  type: z
    .string()
    .optional()
    .transform((value) => ACTIVITY_TYPES.find((type) => type === value)),
  category: z
    .string()
    .optional()
    .transform((value) => ACTIVITY_CATEGORIES.find((category) => category === value)),
  userId: optionalId,
  companyId: optionalId,
  contactId: optionalId,
  leadId: optionalId,
  dealId: optionalId,
  dateFrom: optionalDate("start"),
  dateTo: optionalDate("end"),
});

export type ActivityFilters = z.infer<typeof activityFiltersSchema>;
