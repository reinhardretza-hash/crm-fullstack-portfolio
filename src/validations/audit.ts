import { z } from "zod";
import { berlinDayRangeUtc } from "@/lib/timezone";

export const auditFiltersSchema = z.object({
  userId: z.string().trim().optional(),
  action: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  dateFrom: z
    .string()
    .optional()
    .transform((value) =>
      value && !Number.isNaN(Date.parse(value))
        ? berlinDayRangeUtc(new Date(`${value}T12:00:00Z`)).start
        : undefined,
    ),
  dateTo: z
    .string()
    .optional()
    .transform((value) =>
      value && !Number.isNaN(Date.parse(value))
        ? berlinDayRangeUtc(new Date(`${value}T12:00:00Z`)).end
        : undefined,
    ),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;
