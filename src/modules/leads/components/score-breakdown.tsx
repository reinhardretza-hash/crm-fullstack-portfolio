import type { LeadScoreResult } from "../score";

type ScoreBreakdownProps = {
  result: LeadScoreResult;
};

// Macht den Score nachvollziehbar statt Blackbox - zeigt exakt, welche
// Regeln wie viele Punkte beigetragen haben (siehe calculateLeadScore()).
export function ScoreBreakdown({ result }: ScoreBreakdownProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xl font-semibold text-black">{result.total}</p>
      {result.breakdown.length === 0 ? (
        <p className="text-sm text-muted">Noch keine Score-Kriterien erfüllt.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {result.breakdown.map((entry) => (
            <li key={entry.reason} className="flex items-baseline gap-2 text-sm">
              <span className="font-medium text-gold-foreground">+{entry.points}</span>
              <span className="text-black/70">{entry.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
