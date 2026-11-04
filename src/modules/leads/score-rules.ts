import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateLeadScore, DEFAULT_LEAD_SCORE_RULE_POINTS, type LeadScoreRuleConfig } from "./score";

// Legt die vier unterstützten Regeln idempotent mit ihren Standard-
// Punktwerten an, falls sie fehlen (identisches Muster zu
// seedDefaultPipeline() in prisma/seed.ts) - wird vom Seed-Skript und von
// tests/integration/setup.ts aufgerufen, nicht bei jedem Request.
export async function ensureDefaultLeadScoreRules(
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  for (const [rule, points] of Object.entries(DEFAULT_LEAD_SCORE_RULE_POINTS)) {
    await client.leadScoreRule.upsert({
      where: { rule: rule as keyof typeof DEFAULT_LEAD_SCORE_RULE_POINTS },
      update: {},
      create: { rule: rule as keyof typeof DEFAULT_LEAD_SCORE_RULE_POINTS, points, enabled: true },
    });
  }
}

// Service-Schicht: lädt die Regelkonfiguration aus der DB und übergibt sie
// an die PURE Score-Funktion (siehe Vorgabe Punkt 18) - calculateLeadScore
// selbst macht nie einen DB-Zugriff. Nimmt optional einen Transaction
// Client entgegen, damit Aufrufer innerhalb einer laufenden Transaktion
// (z. B. Lead erstellen/bearbeiten) nicht auf eine zweite, separate
// Verbindung ausweichen müssen.
export async function getLeadScoreRules(
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<LeadScoreRuleConfig[]> {
  const rows = await client.leadScoreRule.findMany();
  return rows.map((row) => ({ rule: row.rule, points: row.points, enabled: row.enabled }));
}

const RECALCULATE_BATCH_SIZE = 200;

// Kontrollierte Recalculate-Funktion (siehe Vorgabe Punkt 19): bei
// Regeländerungen wird der Score aller aktiven (nicht gelöschten) Leads
// neu berechnet und persistiert - in Batches statt einer riesigen
// einzelnen UPDATE-Query, jeder Batch in einer eigenen Transaktion. Score
// bleibt bewusst ein persistiertes Feld (nicht dynamisch bei jedem Lesen
// berechnet) - für Sortierung/Filterung nach Score (siehe Lead-Liste) ist
// ein persistiertes, indexiertes Feld performanter und konsistenter als
// eine Berechnung pro Zeile bei jedem Request.
export async function recalculateAllLeadScores(rules: LeadScoreRuleConfig[]): Promise<number> {
  let cursor: string | undefined;
  let updatedCount = 0;

  while (true) {
    const leads = await prisma.lead.findMany({
      where: { deletedAt: null },
      take: RECALCULATE_BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        source: true,
        interest: true,
        score: true,
        company: { select: { country: true, companySize: true } },
      },
    });

    if (leads.length === 0) break;

    const updates = leads
      .map((lead) => {
        const result = calculateLeadScore(
          { source: lead.source, interest: lead.interest, company: lead.company },
          rules,
        );
        return { id: lead.id, newScore: result.total, changed: result.total !== lead.score };
      })
      .filter((entry) => entry.changed);

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((entry) =>
          prisma.lead.update({ where: { id: entry.id }, data: { score: entry.newScore } }),
        ),
      );
    }

    updatedCount += leads.length;
    cursor = leads[leads.length - 1].id;
    if (leads.length < RECALCULATE_BATCH_SIZE) break;
  }

  return updatedCount;
}
