// Priorisierung des "Nächsten Schritts" (reine Logik, ohne DB):
// 1 überfällige Aufgabe, 2 fälliges/überfälliges Follow-up, 3 nächster Termin,
// 4 offener Reminder, 5 künftiges Follow-up, 6 nächste künftige Aufgabe.
export type NextStepKind =
  "TASK_OVERDUE" | "FOLLOW_UP_DUE" | "EVENT" | "REMINDER" | "FOLLOW_UP_UPCOMING" | "TASK_UPCOMING";

export const NEXT_STEP_PRIORITY: Record<NextStepKind, number> = {
  TASK_OVERDUE: 1,
  FOLLOW_UP_DUE: 2,
  EVENT: 3,
  REMINDER: 4,
  FOLLOW_UP_UPCOMING: 5,
  TASK_UPCOMING: 6,
};

export const NEXT_STEP_LABELS: Record<NextStepKind, string> = {
  TASK_OVERDUE: "Überfällige Aufgabe",
  FOLLOW_UP_DUE: "Follow-up fällig",
  EVENT: "Nächster Termin",
  REMINDER: "Offene Erinnerung",
  FOLLOW_UP_UPCOMING: "Nächstes Follow-up",
  TASK_UPCOMING: "Nächste Aufgabe",
};

export type NextStepItem = {
  kind: NextStepKind;
  title: string;
  href: string | null;
  at: Date | null;
};

export function sortNextSteps(items: NextStepItem[]): NextStepItem[] {
  return [...items].sort((a, b) => {
    const byPriority = NEXT_STEP_PRIORITY[a.kind] - NEXT_STEP_PRIORITY[b.kind];
    if (byPriority !== 0) return byPriority;
    if (a.at && b.at) return a.at.getTime() - b.at.getTime();
    return a.at ? -1 : b.at ? 1 : 0;
  });
}

export function pickNextStep(items: NextStepItem[], maxOthers = 3) {
  const sorted = sortNextSteps(items);
  return {
    primary: sorted[0] ?? null,
    others: sorted.slice(1, 1 + maxOthers),
    total: sorted.length,
  };
}
