import { z } from "zod";
import { userRoleSchema } from "./crm-enums";

// Dieselbe Mindestlänge, die bisher nur für den initialen OWNER-Seed
// hartcodiert galt (siehe prisma/seed.ts) - jetzt zentral für JEDES neu
// gesetzte Passwort (Benutzer anlegen, administratives Zurücksetzen,
// eigenes Passwort ändern), damit das Sicherheitsniveau konsistent bleibt.
export const PASSWORD_MIN_LENGTH = 12;
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`);

export const createUserFormSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname ist erforderlich.").max(100),
  lastName: z.string().trim().min(1, "Nachname ist erforderlich.").max(100),
  email: z
    .string()
    .trim()
    .min(1, "E-Mail ist erforderlich.")
    .email("Bitte eine gültige E-Mail-Adresse angeben."),
  role: userRoleSchema,
  password: passwordSchema,
});
export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;

export const updateUserFormSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname ist erforderlich.").max(100),
  lastName: z.string().trim().min(1, "Nachname ist erforderlich.").max(100),
  email: z
    .string()
    .trim()
    .min(1, "E-Mail ist erforderlich.")
    .email("Bitte eine gültige E-Mail-Adresse angeben."),
  role: userRoleSchema,
});
export type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;

// Administratives Passwort-Zurücksetzen: nur das neue Passwort, niemals das
// alte (das Formular zeigt/erfragt es gar nicht - siehe Vorgabe Punkt 8).
export const adminSetPasswordSchema = z.object({
  password: passwordSchema,
});

// Eigenes Passwort ändern: zusätzlich das aktuelle Passwort zur
// Verifikation, plus Bestätigung gegen Vertipper.
export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bitte das aktuelle Passwort angeben."),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Bitte das neue Passwort bestätigen."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Die Passwörter stimmen nicht überein.",
    path: ["confirmPassword"],
  });
