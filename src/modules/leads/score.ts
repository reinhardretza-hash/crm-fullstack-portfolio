import type { CompanySize, LeadScoreRuleName, PotentialNeed, Source } from "@/generated/prisma/client";

// Kleine kontrollierte Liste statt einer frei programmierbaren Rule Engine
// (siehe Vorgabe Punkt 16/17): die Punktwerte und der enabled-Status sind
// über /settings/lead-scoring administrierbar (persistiert im
// LeadScoreRule-Model), die eigentliche LOGIK ("wann greift eine Regel")
// bleibt fest im Code - kein JS-Code/Ausdruck wird in der Datenbank
// gespeichert.
export const DEFAULT_LEAD_SCORE_RULE_POINTS: Record<LeadScoreRuleName, number> = {
  LINKEDIN_SOURCE: 10,
  DACH_COMPANY: 10,
  SME_COMPANY: 10,
  NEED_IDENTIFIED: 30,
};

const RULE_REASONS: Record<LeadScoreRuleName, string> = {
  LINKEDIN_SOURCE: "Kontakt über LinkedIn",
  DACH_COMPANY: "Unternehmen im DACH-Raum",
  SME_COMPANY: "Kleines/mittleres Unternehmen (KMU)",
  NEED_IDENTIFIED: "Bedarf erkannt",
};

// KMU im Sinne dieser Regel: alles unterhalb von LARGE/ENTERPRISE.
const KMU_SIZES: CompanySize[] = ["SOLO", "MICRO", "SMALL", "MEDIUM"];

// Freitext-Ländernamen, die zuverlässig genug als "DACH" gelten - bewusst nur
// die drei Länder selbst, keine Rateheuristik auf Städtenamen o. Ä.
const DACH_COUNTRIES = new Set([
  "deutschland",
  "germany",
  "österreich",
  "austria",
  "schweiz",
  "switzerland",
]);

export type LeadScoreInput = {
  source: Source | null | undefined;
  interest: PotentialNeed | null | undefined;
  company: { country: string | null; companySize: CompanySize | null } | null | undefined;
};

export type LeadScoreRuleConfig = {
  rule: LeadScoreRuleName;
  points: number;
  enabled: boolean;
};

export type LeadScoreBreakdownEntry = {
  points: number;
  reason: string;
};

export type LeadScoreResult = {
  total: number;
  breakdown: LeadScoreBreakdownEntry[];
};

// Deterministisch, testbar, nachvollziehbar (keine Blackbox) - siehe Vorgabe.
// Bewusst eine PURE Funktion ohne DB-Zugriff (siehe Vorgabe Punkt 18): die
// Regelkonfiguration wird von einer Service-Schicht (siehe
// src/modules/leads/score-rules.ts) geladen und hier nur noch angewendet.
//
// WICHTIG: Enthält bewusst NUR Kriterien, die zuverlässig aus vorhandenen
// strukturierten CRM-Daten ableitbar sind. Folgende Regeln aus der
// ursprünglichen Beispielliste sind ABSICHTLICH NICHT implementiert, weil
// wir dafür (noch) kein strukturiertes, verlässliches Datenfeld besitzen -
// sie dürfen erst automatisiert werden, sobald ein solches Feld existiert:
//   - "Geschäftsführer/Entscheider" (+15): jobTitle ist Freitext, keine
//     verlässliche Entscheider-Kennzeichnung vorhanden.
//   - "Antwort erhalten" (+20): es gibt keinen strukturierten
//     Activity-Typ, der eine erhaltene Antwort abbildet.
//   - "Termin vereinbart" (+25): würde ein Pattern-Match auf den Namen
//     einer Pipeline-Stufe erfordern - ausdrücklich untersagt (Stufen nur
//     über isWonStage/isLostStage-Flags erkennen, niemals über den Namen).
//   - negative Faktoren ("kein Bedarf", "Dienstleister/Pitch"): das Fehlen
//     eines Felds ist kein verlässliches Signal für "trifft nicht zu".
export function calculateLeadScore(
  input: LeadScoreInput,
  rules: LeadScoreRuleConfig[],
): LeadScoreResult {
  const breakdown: LeadScoreBreakdownEntry[] = [];
  const enabledPoints = new Map(
    rules.filter((rule) => rule.enabled).map((rule) => [rule.rule, rule.points]),
  );

  function applyIfEnabled(ruleName: LeadScoreRuleName) {
    const points = enabledPoints.get(ruleName);
    if (points !== undefined) {
      breakdown.push({ points, reason: RULE_REASONS[ruleName] });
    }
  }

  if (input.source === "LINKEDIN") {
    applyIfEnabled("LINKEDIN_SOURCE");
  }

  if (input.interest) {
    applyIfEnabled("NEED_IDENTIFIED");
  }

  const country = input.company?.country?.trim().toLowerCase();
  if (country && DACH_COUNTRIES.has(country)) {
    applyIfEnabled("DACH_COMPANY");
  }

  const companySize = input.company?.companySize;
  if (companySize && KMU_SIZES.includes(companySize)) {
    applyIfEnabled("SME_COMPANY");
  }

  return {
    total: breakdown.reduce((sum, entry) => sum + entry.points, 0),
    breakdown,
  };
}
