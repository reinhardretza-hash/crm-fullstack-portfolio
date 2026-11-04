import { AppError } from "@/lib/errors";

// Eine Aufgabe darf mit höchstens EINER primären CRM-Entität verknüpft
// sein (0 ist zulässig - eine rein interne Aufgabe). Pure Funktion (keine
// DB-Zugriffe) - direkt unit-testbar; die DB-seitige Absicherung läuft
// über die CHECK-Constraint "tasks_at_most_one_target_check"
// (num_nonnulls(...) <= 1, siehe Migration).
export function assertAtMostOneCrmTarget(data: {
  companyId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
}): void {
  const setCount = [data.companyId, data.contactId, data.leadId, data.dealId].filter(
    Boolean,
  ).length;
  if (setCount > 1) {
    throw new AppError(
      "Eine Aufgabe darf höchstens einem Unternehmen, Kontakt, Lead oder Deal zugeordnet sein.",
    );
  }
}
