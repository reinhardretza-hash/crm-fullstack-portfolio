import { z } from "zod";
import { normalizeUrl } from "@/lib/normalize";
import { contactStatusSchema, sourceSchema } from "./crm-enums";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

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

const optionalEmailField = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine((value) => !value || z.string().email().safeParse(value).success, {
    message: "Bitte eine gültige E-Mail-Adresse angeben.",
  });

export const contactFormSchema = z
  .object({
    firstName: optionalTrimmedString,
    lastName: optionalTrimmedString,
    jobTitle: optionalTrimmedString,
    companyId: optionalTrimmedString,
    email: optionalEmailField,
    phone: optionalTrimmedString,
    mobile: optionalTrimmedString,
    linkedinUrl: optionalUrlField,
    website: optionalUrlField,
    source: sourceSchema.optional(),
    status: contactStatusSchema.default("NEW"),
    assignedUserId: optionalTrimmedString,
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  // Keine leeren Kontakte: mindestens Vor- oder Nachname muss vorhanden sein.
  .refine((data) => Boolean(data.firstName || data.lastName), {
    message: "Bitte Vorname oder Nachname angeben.",
    path: ["firstName"],
  });

export type ContactFormInput = z.input<typeof contactFormSchema>;
export type ContactFormValues = z.output<typeof contactFormSchema>;

export const contactFiltersSchema = z.object({
  q: z.string().trim().optional(),
  status: contactStatusSchema.optional(),
  source: sourceSchema.optional(),
  companyId: z.string().trim().optional(),
  assignedUserId: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  sort: z.enum(["name", "updatedAt", "status"]).default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type ContactFilters = z.infer<typeof contactFiltersSchema>;
