import { z } from "zod";

const optionalProbability = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") return undefined;
    return typeof value === "number" ? value : Number(value);
  })
  .refine(
    (value) => value === undefined || (Number.isInteger(value) && value >= 0 && value <= 100),
    {
      message: "Wahrscheinlichkeit muss zwischen 0 und 100 liegen.",
    },
  );

const optionalColor = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || /^#[0-9a-fA-F]{6}$/.test(value), {
    message: "Bitte eine gültige Farbe im Format #RRGGBB angeben.",
  });

export const pipelineStageFormSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(100),
  probability: optionalProbability,
  color: optionalColor,
  isWonStage: z
    .union([z.literal("on"), z.literal("true")])
    .optional()
    .transform((value) => value !== undefined),
  isLostStage: z
    .union([z.literal("on"), z.literal("true")])
    .optional()
    .transform((value) => value !== undefined),
  expectedVersion: z.coerce.number().int().min(1),
});
// Won UND Lost gleichzeitig ist bereits durch die PostgreSQL-CHECK-
// Constraint "pipeline_stages_not_won_and_lost_check" verhindert (siehe
// Migration aus Phase 3) - hier zusätzlich serverseitig geprüft, damit der
// Benutzer eine verständliche Formular-Fehlermeldung sieht statt eines
// rohen DB-Fehlers.
export const pipelineStageFormSchemaRefined = pipelineStageFormSchema.refine(
  (data) => !(data.isWonStage && data.isLostStage),
  {
    message: "Eine Stufe kann nicht gleichzeitig Gewonnen- und Verloren-Stufe sein.",
    path: ["isWonStage"],
  },
);
export type PipelineStageFormValues = z.infer<typeof pipelineStageFormSchemaRefined>;

export const moveStageSchema = z.object({
  stageId: z.string().trim().min(1),
  direction: z.enum(["up", "down"]),
});

export const togglePipelineActiveSchema = z.object({
  pipelineId: z.string().trim().min(1),
  isActive: z.boolean(),
});
