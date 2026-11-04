"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { LEAD_SCORE_RULE_NAME_VALUES } from "@/validations/crm-enums";
import { getLeadScoreRules, recalculateAllLeadScores } from "./score-rules";

export type ScoreRulesActionState = {
  error: string | null;
  recalculatedCount: number | null;
};

// Betrifft mehrere Zeilen gleichzeitig (eine Regel-Tabelle als Ganzes) -
// es gibt keine einzelne "Entität", auf die sich der Audit-Eintrag
// bezieht. "lead-score-rules" ist ein bewusst symbolischer Platzhalter-
// Identifier für diesen Fall, kein echtes Datensatz-ID.
const LEAD_SCORE_RULES_AGGREGATE_ENTITY_ID = "lead-score-rules";

export async function updateLeadScoreRulesAction(
  _previousState: ScoreRulesActionState,
  formData: FormData,
): Promise<ScoreRulesActionState> {
  const user = await requireUser();
  requirePermission(user, "LEAD_SCORING_MANAGE");

  const updates = LEAD_SCORE_RULE_NAME_VALUES.map((rule) => {
    const pointsRaw = formData.get(`points_${rule}`);
    const points =
      typeof pointsRaw === "string" && pointsRaw.trim() !== "" ? Number(pointsRaw) : NaN;
    const enabled = formData.get(`enabled_${rule}`) !== null;
    return { rule, points, enabled };
  });

  if (
    updates.some(
      (update) =>
        !Number.isInteger(update.points) || update.points < 0 || update.points > 536870911,
    )
  ) {
    return {
      error: "Bitte für jede Regel eine gültige, nicht-negative Punktzahl angeben.",
      recalculatedCount: null,
    };
  }

  // Transaktional, weil eine kontrollierte Recalculate-Funktion
  // anschließend auf Basis GENAU dieser neuen Werte läuft (siehe Vorgabe
  // Punkt 19/30) - die Regelzeilen müssen vollständig committet sein,
  // bevor recalculateAllLeadScores() sie liest.
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.leadScoreRule.upsert({
        where: { rule: update.rule },
        update: { points: update.points, enabled: update.enabled },
        create: { rule: update.rule, points: update.points, enabled: update.enabled },
      });
    }
    await writeCrmAuditLog(tx, {
      action: "LEAD_SCORING_UPDATED",
      userId: user.id,
      entityType: "LeadScoreRule",
      entityId: LEAD_SCORE_RULES_AGGREGATE_ENTITY_ID,
      metadata: { updates },
    });
  });

  const rules = await getLeadScoreRules();
  const recalculatedCount = await recalculateAllLeadScores(rules);

  revalidatePath("/settings/lead-scoring");
  revalidatePath("/leads");
  return { error: null, recalculatedCount };
}
