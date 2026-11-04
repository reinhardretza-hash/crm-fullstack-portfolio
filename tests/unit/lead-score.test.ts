import { describe, expect, it } from "vitest";
import { calculateLeadScore, DEFAULT_LEAD_SCORE_RULE_POINTS } from "@/modules/leads/score";
import type { LeadScoreRuleConfig } from "@/modules/leads/score";

// Die Standard-Punktwerte als enabled=true Regeln - entspricht dem Zustand
// nach dem Seed (siehe prisma/seed.ts) und ist die Baseline für die
// meisten Tests hier. Einzelne Tests überschreiben gezielt, um die
// Konfigurierbarkeit selbst zu prüfen (siehe Vorgabe Punkt 32: "Lead
// Score Rules").
const DEFAULT_RULES: LeadScoreRuleConfig[] = Object.entries(DEFAULT_LEAD_SCORE_RULE_POINTS).map(
  ([rule, points]) => ({ rule: rule as LeadScoreRuleConfig["rule"], points, enabled: true }),
);

describe("calculateLeadScore", () => {
  it("returns 0 with an empty breakdown when no criteria are met", () => {
    const result = calculateLeadScore({ source: null, interest: null, company: null }, DEFAULT_RULES);
    expect(result.total).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("is deterministic - calling it twice with the same input yields the same result", () => {
    const input = { source: "LINKEDIN" as const, interest: "WEBSITE" as const, company: null };
    expect(calculateLeadScore(input, DEFAULT_RULES)).toEqual(calculateLeadScore(input, DEFAULT_RULES));
  });

  it("awards points for a LinkedIn source", () => {
    const result = calculateLeadScore({ source: "LINKEDIN", interest: null, company: null }, DEFAULT_RULES);
    expect(result.total).toBe(DEFAULT_LEAD_SCORE_RULE_POINTS.LINKEDIN_SOURCE);
    expect(result.breakdown).toHaveLength(1);
  });

  it("does not award LinkedIn points for a different source", () => {
    const result = calculateLeadScore({ source: "WEBSITE", interest: null, company: null }, DEFAULT_RULES);
    expect(result.total).toBe(0);
  });

  it("awards points when an interest/need is identified", () => {
    const result = calculateLeadScore({ source: null, interest: "SEO", company: null }, DEFAULT_RULES);
    expect(result.total).toBe(DEFAULT_LEAD_SCORE_RULE_POINTS.NEED_IDENTIFIED);
  });

  it("awards DACH points for Germany/Austria/Switzerland (case-insensitive)", () => {
    for (const country of ["Deutschland", "deutschland", "ÖSTERREICH", "Schweiz"]) {
      const result = calculateLeadScore(
        { source: null, interest: null, company: { country, companySize: null } },
        DEFAULT_RULES,
      );
      expect(result.total).toBe(DEFAULT_LEAD_SCORE_RULE_POINTS.DACH_COMPANY);
    }
  });

  it("does not award DACH points for a country outside DACH", () => {
    const result = calculateLeadScore(
      { source: null, interest: null, company: { country: "Frankreich", companySize: null } },
      DEFAULT_RULES,
    );
    expect(result.total).toBe(0);
  });

  it("awards KMU points for SOLO/MICRO/SMALL/MEDIUM company sizes", () => {
    for (const companySize of ["SOLO", "MICRO", "SMALL", "MEDIUM"] as const) {
      const result = calculateLeadScore(
        { source: null, interest: null, company: { country: null, companySize } },
        DEFAULT_RULES,
      );
      expect(result.total).toBe(DEFAULT_LEAD_SCORE_RULE_POINTS.SME_COMPANY);
    }
  });

  it("does not award KMU points for LARGE/ENTERPRISE company sizes", () => {
    for (const companySize of ["LARGE", "ENTERPRISE"] as const) {
      const result = calculateLeadScore(
        { source: null, interest: null, company: { country: null, companySize } },
        DEFAULT_RULES,
      );
      expect(result.total).toBe(0);
    }
  });

  it("sums multiple matching criteria and lists each in the breakdown (nachvollziehbar, not a black box)", () => {
    const result = calculateLeadScore(
      {
        source: "LINKEDIN",
        interest: "CONSULTING",
        company: { country: "Deutschland", companySize: "SMALL" },
      },
      DEFAULT_RULES,
    );

    expect(result.total).toBe(
      DEFAULT_LEAD_SCORE_RULE_POINTS.LINKEDIN_SOURCE +
        DEFAULT_LEAD_SCORE_RULE_POINTS.NEED_IDENTIFIED +
        DEFAULT_LEAD_SCORE_RULE_POINTS.DACH_COMPANY +
        DEFAULT_LEAD_SCORE_RULE_POINTS.SME_COMPANY,
    );
    expect(result.breakdown).toHaveLength(4);
    expect(result.breakdown.reduce((sum, entry) => sum + entry.points, 0)).toBe(result.total);
  });

  it("never guesses criteria from unstructured data - job title / 'answer received' / 'appointment set' are not inputs", () => {
    // Dieser Test dokumentiert bewusst, was NICHT Teil der Funktion ist:
    // calculateLeadScore kennt keinen jobTitle-Parameter und keinen
    // "hat geantwortet"/"Termin vereinbart"-Parameter - diese Kriterien
    // dürfen laut Vorgabe nicht aus ungesicherten Daten geraten werden.
    const result = calculateLeadScore({ source: null, interest: null, company: null }, DEFAULT_RULES);
    expect(
      result.breakdown.some((entry) => /Geschäftsführer|Antwort|Termin/.test(entry.reason)),
    ).toBe(false);
  });

  describe("Konfigurierbarkeit (siehe Vorgabe Punkt 16-18)", () => {
    it("uses the configured points, not a hardcoded value", () => {
      const customRules: LeadScoreRuleConfig[] = [
        { rule: "LINKEDIN_SOURCE", points: 99, enabled: true },
      ];
      const result = calculateLeadScore(
        { source: "LINKEDIN", interest: null, company: null },
        customRules,
      );
      expect(result.total).toBe(99);
    });

    it("does not apply a disabled rule, even if the criterion matches", () => {
      const customRules: LeadScoreRuleConfig[] = [
        { rule: "LINKEDIN_SOURCE", points: 10, enabled: false },
      ];
      const result = calculateLeadScore(
        { source: "LINKEDIN", interest: null, company: null },
        customRules,
      );
      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it("treats a missing rule row the same as a disabled rule (no crash, no points)", () => {
      const result = calculateLeadScore({ source: "LINKEDIN", interest: null, company: null }, []);
      expect(result.total).toBe(0);
    });
  });
});
