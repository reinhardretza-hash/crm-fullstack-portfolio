import { z } from "zod";
import { euroToCents } from "@/lib/money";
import { leadStatusSchema, potentialNeedSchema, prioritySchema, sourceSchema } from "./crm-enums";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

// Geldeingabe in Euro (z. B. "15000" oder "15000,50") -> Cent, siehe
// src/lib/money.ts für die Geld-Strategie.
const optionalEuroToCents = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || !Number.isNaN(Number.parseFloat(value.replace(",", "."))),
    {
      message: "Bitte einen gültigen Geldbetrag angeben.",
    },
  )
  .transform((value) => (value === undefined ? undefined : euroToCents(value)));

const optionalProbability = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === "") return undefined;
    const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  })
  .refine((value) => value === undefined || (value >= 0 && value <= 100), {
    message: "Wahrscheinlichkeit muss zwischen 0 und 100 liegen.",
  });

const optionalDateTimeLocal = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || !Number.isNaN(Date.parse(value)), {
    message: "Bitte ein gültiges Datum angeben.",
  })
  .transform((value) => (value === undefined ? undefined : new Date(value)));

export const leadFormSchema = z
  .object({
    title: z.string().trim().min(1, "Titel ist erforderlich.").max(200),
    companyId: optionalTrimmedString,
    contactId: optionalTrimmedString,
    pipelineId: z.string().trim().min(1, "Pipeline ist erforderlich."),
    stageId: z.string().trim().min(1, "Pipeline-Stufe ist erforderlich."),
    source: sourceSchema.optional(),
    interest: potentialNeedSchema.optional(),
    expectedValueCents: optionalEuroToCents,
    priority: prioritySchema.default("NORMAL"),
    probability: optionalProbability,
    assignedUserId: optionalTrimmedString,
    nextFollowUpAt: optionalDateTimeLocal,
    description: optionalTrimmedString,
  })
  // Ein Lead ohne Company UND ohne Contact ist nur in Ausnahmefällen fachlich
  // sinnvoll (siehe Vorgabe) - das Standard-Erstellformular verlangt daher
  // mindestens eines von beiden. Technisch (Schema/DB) bleibt nur "mindestens
  // eines" erzwungen, nicht zwingend über dieses Formular.
  .refine((data) => Boolean(data.companyId) || Boolean(data.contactId), {
    message: "Bitte ein Unternehmen oder einen Kontakt auswählen.",
    path: ["companyId"],
  });

export type LeadFormValues = z.infer<typeof leadFormSchema>;

export const leadFiltersSchema = z.object({
  q: z.string().trim().optional(),
  pipelineId: z.string().trim().optional(),
  stageId: z.string().trim().optional(),
  status: leadStatusSchema.optional(),
  priority: prioritySchema.optional(),
  interest: potentialNeedSchema.optional(),
  source: sourceSchema.optional(),
  assignedUserId: z.string().trim().optional(),
  scoreMin: z.coerce.number().int().min(0).optional(),
  scoreMax: z.coerce.number().int().min(0).optional(),
  overdue: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  sort: z
    .enum(["title", "score", "priority", "expectedValueCents", "nextFollowUpAt", "updatedAt"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const stageMoveSchema = z.object({
  leadId: z.string().trim().min(1),
  toStageId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().min(1),
});

export const FOLLOW_UP_VIEW_VALUES = ["all", "overdue", "today", "upcoming"] as const;
export type FollowUpView = (typeof FOLLOW_UP_VIEW_VALUES)[number];

export const followUpFiltersSchema = z.object({
  view: z.enum(FOLLOW_UP_VIEW_VALUES).default("all"),
});

export type FollowUpFilters = z.infer<typeof followUpFiltersSchema>;
