import { CalendarContextSection } from "@/modules/calendar/components/context-section";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "@/modules/activity/components/timeline";
import { EmailContextSection } from "@/modules/email/components/email-context-section";
import { getLeadById } from "@/modules/leads/queries";
import { listDealsForLead } from "@/modules/deals/queries";
import { DealCompactList } from "@/modules/deals/components/deal-compact-list";
import { listTasksForLead } from "@/modules/tasks/queries";
import { TaskCompactList } from "@/modules/tasks/components/task-compact-list";
import { calculateLeadScore } from "@/modules/leads/score";
import { getLeadScoreRules } from "@/modules/leads/score-rules";
import { isLeadFollowUpOverdue } from "@/modules/leads/stage-status";
import { FollowUpForm } from "@/modules/leads/components/follow-up-form";
import { ScoreBreakdown } from "@/modules/leads/components/score-breakdown";
import { contactDisplayName } from "@/modules/contacts/helpers";
import {
  LEAD_STATUS_LABELS,
  POTENTIAL_NEED_LABELS,
  PRIORITY_LABELS,
  SOURCE_LABELS,
} from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";
import { toDateTimeLocalValue } from "@/lib/datetime";
import { NoteForm } from "@/modules/notes/components/note-form";
import { NoteList } from "@/modules/notes/components/note-list";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: LeadDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const lead = await getLeadById(id);
  return { title: lead ? `${lead.title} – RDEvolution CRM` : "Lead – RDEvolution CRM" };
}

export default async function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = await params;
  const [lead, deals, tasks, scoreRules] = await Promise.all([
    getLeadById(id),
    listDealsForLead(id),
    listTasksForLead(id),
    getLeadScoreRules(),
  ]);

  if (!lead) {
    notFound();
  }

  const scoreResult = calculateLeadScore(
    {
      source: lead.source,
      interest: lead.interest,
      company: lead.company,
    },
    scoreRules,
  );
  const overdue = isLeadFollowUpOverdue(lead);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-black">{lead.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={lead.status === "WON" ? "gold" : "neutral"}>
              {LEAD_STATUS_LABELS[lead.status]}
            </Badge>
            <span className="text-sm text-muted">{lead.stage.name}</span>
            {overdue && (
              <Badge variant="neutral" className="bg-red-100 text-red-700">
                Follow-up überfällig
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/deals/new?leadId=${lead.id}`}>
            <Button variant="secondary">Deal erstellen</Button>
          </Link>
          <Link href={`/leads/${lead.id}/edit`}>
            <Button variant="secondary">Bearbeiten</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <CalendarContextSection context={{ leadId: lead.id }} assignedUserId={lead.assignedUserId} />
          <EmailContextSection context={{ leadId: lead.id }} canCompose={!!lead.contact?.email} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <DataRow
                label="Unternehmen"
                value={
                  lead.company
                    ? { text: lead.company.name, href: `/companies/${lead.company.id}` }
                    : undefined
                }
              />
              <DataRow
                label="Kontakt"
                value={
                  lead.contact
                    ? {
                        text: contactDisplayName(lead.contact),
                        href: `/contacts/${lead.contact.id}`,
                      }
                    : undefined
                }
              />
              <DataRow
                label="Interesse"
                value={lead.interest ? { text: POTENTIAL_NEED_LABELS[lead.interest] } : undefined}
              />
              <DataRow
                label="Quelle"
                value={lead.source ? { text: SOURCE_LABELS[lead.source] } : undefined}
              />
              <DataRow label="Priorität" value={{ text: PRIORITY_LABELS[lead.priority] }} />
              <DataRow
                label="Erwarteter Wert"
                value={
                  lead.expectedValueCents !== null
                    ? { text: formatCentsAsEuro(lead.expectedValueCents) }
                    : undefined
                }
              />
              <DataRow
                label="Wahrscheinlichkeit"
                value={
                  lead.probability !== null
                    ? { text: `${lead.probability}%` }
                    : lead.stage.probability !== null
                      ? { text: `${lead.stage.probability}% (Stufen-Standard)` }
                      : undefined
                }
              />
              <DataRow
                label="Verantwortlicher"
                value={
                  lead.assignedUser
                    ? { text: `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}` }
                    : undefined
                }
              />
            </CardContent>
          </Card>

          {lead.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-black/80">{lead.description}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Follow-up</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpForm
                leadId={lead.id}
                currentValueLocal={toDateTimeLocalValue(lead.nextFollowUpAt)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <NoteForm leadId={lead.id} />
              <NoteList notes={lead.notes} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Score</CardTitle>
            </CardHeader>
            <CardContent>
              <ScoreBreakdown result={scoreResult} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deals ({deals.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <DealCompactList deals={deals} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Offene Aufgaben ({tasks.length})</CardTitle>
              <Link
                href={`/tasks/new?leadId=${lead.id}`}
                className="text-xs text-muted hover:underline"
              >
                + Aufgabe erstellen
              </Link>
            </CardHeader>
            <CardContent>
              <TaskCompactList tasks={tasks} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline activities={lead.activities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: { text: string; href?: string } }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      {value ? (
        value.href ? (
          <Link href={value.href} className="text-black hover:underline">
            {value.text}
          </Link>
        ) : (
          <p className="text-black/80">{value.text}</p>
        )
      ) : (
        <p className="text-muted">–</p>
      )}
    </div>
  );
}
