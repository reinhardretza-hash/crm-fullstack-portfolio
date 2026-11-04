import { z } from "zod";

// Serverseitig erzwungen: eine Notiz gehört zu GENAU einem unterstützten Ziel
// - nie zu mehreren, nie zu keinem. Zusätzlich auf DB-Ebene abgesichert über
// die PostgreSQL-CHECK-Constraint "notes_exactly_one_target_check" (seit
// Phase 4 eine 4-Wege-Variante inkl. Deal).
export const noteFormSchema = z
  .object({
    content: z.string().trim().min(1, "Notiz darf nicht leer sein.").max(5000),
    companyId: z.string().trim().optional(),
    contactId: z.string().trim().optional(),
    leadId: z.string().trim().optional(),
    dealId: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      [data.companyId, data.contactId, data.leadId, data.dealId].filter(Boolean).length === 1,
    {
      message: "Eine Notiz muss genau einem Unternehmen, Kontakt, Lead oder Deal zugeordnet sein.",
      path: ["companyId"],
    },
  );

export type NoteFormValues = z.infer<typeof noteFormSchema>;
