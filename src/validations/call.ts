import { z } from "zod";
import { CALL_OUTCOMES } from "@/modules/activity/catalog";
import { isCalendarDate } from "@/lib/timezone";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Höchstens ${max} Zeichen.`)
    .optional()
    .transform((value) => value || undefined);
const optionalId = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => value || undefined);

// Anruf dokumentieren: genau ein Ziel; Ergebnis Pflicht; alles Weitere optional.
export const callLogSchema = z
  .object({
    companyId: optionalId,
    contactId: optionalId,
    dealId: optionalId,
    outcome: z.enum(CALL_OUTCOMES, { error: "Bitte ein Ergebnis wählen." }),
    note: optionalText(200),
    durationMinutes: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.coerce
        .number({ error: "Bitte die Dauer in Minuten angeben." })
        .int("Bitte ganze Minuten angeben.")
        .min(1, "Mindestens 1 Minute.")
        .max(600, "Höchstens 600 Minuten.")
        .optional(),
    ),
    nextStep: optionalText(200),
    followUpDate: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || undefined)
      .refine(
        (value) => value === undefined || isCalendarDate(value),
        "Bitte ein gültiges Datum angeben.",
      ),
  })
  .refine(
    (value) => [value.companyId, value.contactId, value.dealId].filter(Boolean).length === 1,
    {
      message: "Ein Anruf muss genau einem Unternehmen, Kontakt oder Deal zugeordnet sein.",
    },
  );
export type CallLogInput = z.infer<typeof callLogSchema>;
