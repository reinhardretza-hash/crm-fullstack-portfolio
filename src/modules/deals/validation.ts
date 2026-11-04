import { AppError } from "@/lib/errors";

// Zentrale Validierungsfunktion für die Konsistenz Lead -> Deal (siehe
// Vorgabe Punkt 9): wenn ein Deal einem Lead zugeordnet wird UND dieser Lead
// bereits ein Unternehmen hat, darf das Unternehmen des Deals dem
// widersprechenden Unternehmen nicht widersprechen. Der Kontakt wird
// bewusst NICHT hart blockiert (ein Deal darf z. B. mit einem anderen
// Ansprechpartner desselben Unternehmens laufen als der ursprüngliche
// Lead-Kontakt) - nur die Unternehmens-Zuordnung muss widerspruchsfrei
// bleiben. Pure Funktion (keine DB-Zugriffe) - leicht unit-testbar; der
// Aufrufer (src/modules/deals/actions.ts) lädt den Lead vorher selbst.
export function assertLeadCompanyConsistency(
  lead: { companyId: string | null } | null,
  dealCompanyId: string,
): void {
  if (!lead || !lead.companyId) {
    return;
  }
  if (lead.companyId !== dealCompanyId) {
    throw new AppError(
      "Das gewählte Unternehmen passt nicht zum Unternehmen des verknüpften Leads.",
    );
  }
}
