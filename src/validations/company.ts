import { z } from "zod";
import { normalizeUrl } from "@/lib/normalize";
import {
  companySizeSchema,
  companyStatusSchema,
  potentialNeedSchema,
  sourceSchema,
} from "./crm-enums";

// Freiwillige URL: leer bleibt leer, ein gefüllter Wert muss sich normalisieren
// lassen (akzeptiert "example.de" ebenso wie "https://example.de", lehnt
// gefährliche Schemes ab - siehe normalizeUrl()).
const optionalUrlField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => {
      if (!value) return true;
      try {
        normalizeUrl(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Bitte eine gültige URL angeben." },
  );

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

export const companyFormSchema = z.object({
  name: z.string().trim().min(1, "Firmenname ist erforderlich.").max(200),
  website: optionalUrlField,
  industry: optionalTrimmedString,
  phone: optionalTrimmedString,
  email: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : undefined))
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Bitte eine gültige E-Mail-Adresse angeben.",
    }),
  street: optionalTrimmedString,
  postalCode: optionalTrimmedString,
  city: optionalTrimmedString,
  country: optionalTrimmedString,
  employeeCount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") return undefined;
      const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }),
  companySize: companySizeSchema.optional(),
  description: optionalTrimmedString,
  status: companyStatusSchema.default("PROSPECT"),
  source: sourceSchema.optional(),
  assignedUserId: optionalTrimmedString,
  needs: z.array(potentialNeedSchema).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
});

export type CompanyFormInput = z.input<typeof companyFormSchema>;
export type CompanyFormValues = z.output<typeof companyFormSchema>;

export const companyFiltersSchema = z.object({
  q: z.string().trim().optional(),
  status: companyStatusSchema.optional(),
  source: sourceSchema.optional(),
  industry: z.string().trim().optional(),
  assignedUserId: z.string().trim().optional(),
  companySize: companySizeSchema.optional(),
  tag: z.string().trim().optional(),
  sort: z.enum(["name", "updatedAt", "city", "status"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type CompanyFilters = z.infer<typeof companyFiltersSchema>;
