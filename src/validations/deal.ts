import { z } from "zod";
import { euroToCents } from "@/lib/money";
import { dealLostReasonSchema, dealStatusSchema, potentialNeedSchema } from "./crm-enums";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

// Geldeingabe in Euro (z. B. "15000" oder "15000,50") -> Cent, siehe
// src/lib/money.ts für die Geld-Strategie. Anders als bei Lead ist der
// Deal-Wert PFLICHT (ein Deal ohne Wert ist fachlich nicht sinnvoll).
const requiredEuroToCents = z
  .string()
  .trim()
  .min(1, "Bitte einen Wert angeben.")
  .refine((value) => !Number.isNaN(Number.parseFloat(value.replace(",", "."))), {
    message: "Bitte einen gültigen Geldbetrag angeben.",
  })
  .transform((value) => euroToCents(value));

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

const optionalDateOnly = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || !Number.isNaN(Date.parse(value)), {
    message: "Bitte ein gültiges Datum angeben.",
  })
  .transform((value) => (value === undefined ? undefined : new Date(value)));

export const dealFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name ist erforderlich.").max(200),
    companyId: z.string().trim().min(1, "Unternehmen ist erforderlich."),
    contactId: optionalTrimmedString,
    leadId: optionalTrimmedString,
    assignedUserId: optionalTrimmedString,
    service: potentialNeedSchema,
    valueCents: requiredEuroToCents,
    probability: optionalProbability,
    expectedCloseDate: optionalDateOnly,
    description: optionalTrimmedString,
  })
  .strict();

export type DealFormValues = z.infer<typeof dealFormSchema>;

export const dealFiltersSchema = z.object({
  q: z.string().trim().optional(),
  status: dealStatusSchema.optional(),
  service: potentialNeedSchema.optional(),
  assignedUserId: z.string().trim().optional(),
  companyId: z.string().trim().optional(),
  closeDateFrom: z
    .string()
    .optional()
    .transform((value) =>
      value && !Number.isNaN(Date.parse(value)) ? new Date(value) : undefined,
    ),
  closeDateTo: z
    .string()
    .optional()
    .transform((value) =>
      value && !Number.isNaN(Date.parse(value)) ? new Date(value) : undefined,
    ),
  // Der URL-Parameter trägt bereits Cent (die UI rechnet beim Setzen des
  // Filters von Euro nach Cent um, siehe DealValueRangeFilter) - dieselbe
  // Money-Strategie wie überall sonst, nur an der Filter-URL sichtbar.
  valueMinCents: z.coerce.number().int().min(0).optional(),
  valueMaxCents: z.coerce.number().int().min(0).optional(),
  sort: z
    .enum(["name", "valueCents", "probability", "expectedCloseDate", "updatedAt"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type DealFilters = z.infer<typeof dealFiltersSchema>;

export const dealWonSchema = z.object({
  dealId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().min(1),
});

export const dealDeleteSchema = z.object({
  dealId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().min(1),
});

export const dealLostSchema = z.object({
  dealId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().min(1),
  // Für Version 1 bewusst optional statt Pflicht (siehe Vorgabe
  // "sinnvollerweise Pflicht prüfen"): ein Nutzer soll einen Deal auch dann
  // sofort als verloren markieren können, wenn der Grund im Moment noch
  // nicht bekannt ist - eine Pflicht hier würde das nur verzögern, ohne
  // einen echten fachlichen Mehrwert zu bringen (der Grund kann jederzeit
  // nachträglich über "Bearbeiten" ergänzt werden).
  lostReason: dealLostReasonSchema.optional(),
  lostReasonNote: optionalTrimmedString,
});

export const dealReopenSchema = z.object({
  dealId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().min(1),
});
