import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { LEAD_SCORE_RULE_NAME_VALUES } from "@/validations/crm-enums";
import { getLeadScoreRules } from "@/modules/leads/score-rules";
import { ScoreRulesForm } from "@/modules/leads/components/score-rules-form";

export const metadata: Metadata = {
  title: "Lead-Scoring-Einstellungen – RDEvolution CRM",
};

export default async function LeadScoringSettingsPage() {
  const user = await requireUser();
  requirePagePermission(user, "LEAD_SCORING_MANAGE");

  const rules = await getLeadScoreRules();
  const rulesByName = new Map(rules.map((rule) => [rule.rule, rule]));
  // Feste Anzeigereihenfolge statt der (unsortierten) DB-Reihenfolge -
  // fehlende Zeilen (z. B. ganz frische DB ohne Seed-Lauf) fallen auf
  // enabled=false/0 Punkte zurück, damit die Seite nie abstürzt.
  const orderedRules = LEAD_SCORE_RULE_NAME_VALUES.map(
    (rule) => rulesByName.get(rule) ?? { rule, points: 0, enabled: false },
  );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Lead-Scoring-Einstellungen</h2>
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Regeln</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreRulesForm rules={orderedRules} />
        </CardContent>
      </Card>
    </div>
  );
}
