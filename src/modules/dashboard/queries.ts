import { prisma } from "@/lib/prisma";
import { centsToEuro } from "@/lib/money";
import { getLeadDashboardSummary } from "@/modules/leads/queries";
import { getDealDashboardSummary } from "@/modules/deals/queries";
import { getTaskDashboardSummary } from "@/modules/tasks/queries";
import type { ActivityType } from "@/generated/prisma/client";
import { ACTIVITY_LABELS } from "@/modules/activity/catalog";

export type DashboardKpis = {
  activeLeads: number;
  openDeals: number;
  openDealsValueEuro: number;
  wonDeals: number;
  lostDeals: number;
  openTasks: number;
  tasksToday: number;
  overdueTasks: number;
  pipelineValueEuro: number;
};

// Aktive Leads/Pipeline-Wert (Phase 3), Offene Deals/Deal-Wert/Gewonnen/
// Verloren (Phase 4) und jetzt Aufgaben heute/überfällig/offen (Phase 5)
// sind echte Aggregationen. Lead-Pipeline-Wert und Deal-Wert bleiben
// bewusst getrennte Kennzahlen (siehe Vorgabe) - NICHT addiert oder
// ersetzt, da sie fachlich Unterschiedliches bedeuten.
export async function getDashboardKpis(): Promise<DashboardKpis> {
  const [
    { activeLeads, pipelineValueCents },
    { openDeals, openDealsValueCents, wonDeals, lostDeals },
    { openTasks, dueToday, overdue },
  ] = await Promise.all([
    getLeadDashboardSummary(),
    getDealDashboardSummary(),
    getTaskDashboardSummary(),
  ]);

  return {
    activeLeads,
    openDeals,
    openDealsValueEuro: centsToEuro(openDealsValueCents),
    wonDeals,
    lostDeals,
    openTasks,
    tasksToday: dueToday,
    overdueTasks: overdue,
    pipelineValueEuro: centsToEuro(pipelineValueCents),
  };
}

export type ActivitySummary = {
  id: string;
  description: string;
  occurredAt: Date;
};

type RecentActivityRow = {
  id: string;
  type: ActivityType;
  createdAt: Date;
  company: { name: string } | null;
  contact: { firstName: string | null; lastName: string | null } | null;
  lead: { title: string } | null;
  deal: { name: string } | null;
  task: { title: string } | null;
};

function describeActivity(activity: RecentActivityRow): string {
  // Bug gefunden durch einen Unit-Test: `[a, b].filter(Boolean).join(" ")`
  // liefert bei fehlendem Kontakt "" (leerer String), nicht null/undefined -
  // "" bricht eine `??`-Kette NICHT ab, wodurch `lead.title` nie erreicht
  // wurde. Der Kontaktname wird daher nur berechnet, wenn ein Kontakt
  // überhaupt existiert, sonst bleibt er explizit null.
  const contactName = activity.contact
    ? [activity.contact.firstName, activity.contact.lastName].filter(Boolean).join(" ") || null
    : null;
  const target =
    activity.company?.name ??
    contactName ??
    activity.lead?.title ??
    activity.deal?.name ??
    activity.task?.title ??
    null;

  const label = ACTIVITY_LABELS[activity.type];

  return target ? `${label} – ${target}` : label;
}

// Bewusst entkoppelt vom technischen AuditLog (Login/Logout): Dieses Feld
// bildet die fachliche CRM-Aktivität ab (Company/Contact seit Phase 2, Lead
// seit Phase 3, Deal seit Phase 4, jetzt zusätzlich Task-Aktivitäten aus
// Phase 5).
export async function getRecentActivities(): Promise<ActivitySummary[]> {
  const activities = await prisma.activity.findMany({
    where: {
      AND: [
        { OR: [{ companyId: null }, { company: { deletedAt: null } }] },
        { OR: [{ contactId: null }, { contact: { deletedAt: null } }] },
        { OR: [{ leadId: null }, { lead: { deletedAt: null } }] },
        { OR: [{ dealId: null }, { deal: { deletedAt: null } }] },
        { OR: [{ taskId: null }, { task: { deletedAt: null } }] },
        { OR: [{ calendarEventId: null }, { calendarEvent: { deletedAt: null } }] },
        { OR: [{ quoteId: null }, { quote: { deletedAt: null } }] },
        { OR: [{ invoiceId: null }, { invoice: { deletedAt: null } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
      lead: { select: { title: true } },
      deal: { select: { name: true } },
      task: { select: { title: true } },
    },
  });

  return activities.map((activity) => ({
    id: activity.id,
    description: describeActivity(activity),
    occurredAt: activity.createdAt,
  }));
}
