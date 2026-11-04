import { z } from "zod";

const id = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => value || undefined);

// Zeitraum wird separat über resolveReportPeriod validiert; hier nur
// Benutzer-/Pipeline-Filter (IDs, werden in Prisma parametrisiert).
export const reportFiltersSchema = z.object({ userId: id, pipelineId: id });
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
