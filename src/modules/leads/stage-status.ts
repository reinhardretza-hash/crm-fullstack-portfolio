import type { LeadStatus } from "@/generated/prisma/client";
import { isSameDayInTimeZone } from "@/lib/timezone";

type StageFlags = {
  isWonStage: boolean;
  isLostStage: boolean;
};

type FollowUpLead = { status: LeadStatus; nextFollowUpAt: Date | null };

// EINZIGE Stelle, die aus einer Pipeline-Stufe den Lead-Status ableitet -
// niemals an mehreren Stellen dupliziert (siehe Vorgabe). Erkennt Won/Lost
// ausschließlich über die Flags, NIEMALS über den Namen der Stufe.
export function deriveLeadStatusFromStage(stage: StageFlags): LeadStatus {
  if (stage.isWonStage) return "WON";
  if (stage.isLostStage) return "LOST";
  return "OPEN";
}

// Ein Lead ist nur dann überfällig, wenn er noch aktiv (OPEN) ist - ein
// gewonnener/verlorener/archivierter Lead mit einem vergangenen Follow-up-
// Datum ist nicht "überfällig", die Verkaufschance ist ja bereits entschieden.
// Won/Lost-Leads dürfen grundsätzlich NIE als fällige Follow-ups auftauchen
// (siehe Vorgabe Punkt 27) - alle drei Klassifikationsfunktionen hier
// prüfen daher zuerst `status === "OPEN"`.
export function isLeadFollowUpOverdue(lead: FollowUpLead, now = new Date()): boolean {
  return (
    lead.status === "OPEN" &&
    lead.nextFollowUpAt !== null &&
    lead.nextFollowUpAt.getTime() < now.getTime()
  );
}

// "Heute" nach Europe/Berlin-Kalendertag (siehe src/lib/timezone.ts), nicht
// nach UTC-Kalendertag - dieselbe Begründung wie bei Task.isTaskDueToday.
export function isLeadFollowUpDueToday(lead: FollowUpLead, now = new Date()): boolean {
  return (
    lead.status === "OPEN" &&
    lead.nextFollowUpAt !== null &&
    isSameDayInTimeZone(lead.nextFollowUpAt, now)
  );
}

// "Kommend" = OPEN, hat ein Follow-up-Datum, ist nicht überfällig und nicht
// heute - exklusiv zu den beiden anderen Kategorien (siehe Vorgabe Punkt 27).
export function isLeadFollowUpUpcoming(lead: FollowUpLead, now = new Date()): boolean {
  if (lead.status !== "OPEN" || lead.nextFollowUpAt === null) return false;
  if (isLeadFollowUpOverdue(lead, now)) return false;
  if (isLeadFollowUpDueToday(lead, now)) return false;
  return true;
}
