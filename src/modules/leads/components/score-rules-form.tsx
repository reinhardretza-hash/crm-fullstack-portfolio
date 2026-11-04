"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { LEAD_SCORE_RULE_LABELS } from "@/lib/crm-labels";
import type { LeadScoreRuleConfig } from "../score";
import { updateLeadScoreRulesAction, type ScoreRulesActionState } from "../score-rules-actions";

type ScoreRulesFormProps = {
  rules: LeadScoreRuleConfig[];
};

const initialState: ScoreRulesActionState = { error: null, recalculatedCount: null };

export function ScoreRulesForm({ rules }: ScoreRulesFormProps) {
  const [state, formAction, isPending] = useActionState(updateLeadScoreRulesAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-black/10">
        {rules.map((rule) => (
          <div key={rule.rule} className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`enabled_${rule.rule}`}
                name={`enabled_${rule.rule}`}
                defaultChecked={rule.enabled}
              />
              <label htmlFor={`enabled_${rule.rule}`} className="text-sm text-black/80">
                {LEAD_SCORE_RULE_LABELS[rule.rule]}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={536870911}
                aria-label={`Punkte: ${LEAD_SCORE_RULE_LABELS[rule.rule]}`}
                name={`points_${rule.rule}`}
                defaultValue={rule.points}
                className="w-20 rounded-md border border-black/15 bg-white px-2 py-1 text-sm text-black outline-none focus:border-[var(--gold)]"
              />
              <span className="text-xs text-muted">Punkte</span>
            </div>
          </div>
        ))}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.recalculatedCount !== null && (
        <p className="text-sm text-green-700">
          Gespeichert. {state.recalculatedCount} aktive Leads wurden neu bewertet.
        </p>
      )}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern und neu berechnen"}
        </Button>
      </div>
    </form>
  );
}
