import { z } from "zod";

export const settingsFormSchema = z.object({
  legalCompanyName: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  street: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  postalCode: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  city: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  country: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  vatId: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  taxNumber: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  iban: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  bic: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  bankName: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !/[\r\n\x00-\x1f\x7f]/.test(v), "Keine Steuerzeichen erlaubt.")
    .optional(),
  defaultPaymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
  companyName: z.string().trim().min(1, "Firmenname ist erforderlich.").max(200),
  timezone: z.string().trim().min(1, "Zeitzone ist erforderlich.").max(60),
  currency: z.string().trim().min(1, "Währung ist erforderlich.").max(10),
  defaultPipelineId: z.string().trim().min(1, "Standard-Pipeline ist erforderlich."),
  expectedVersion: z.coerce.number().int().min(1),
});
export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
