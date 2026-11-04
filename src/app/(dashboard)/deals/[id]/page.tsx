import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityDeleteDialog } from "@/components/ui/entity-delete-dialog";
import {
  DEAL_LOST_REASON_LABELS,
  DEAL_STATUS_LABELS,
  POTENTIAL_NEED_LABELS,
} from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { contactDisplayName } from "@/modules/contacts/helpers";
import { deleteDealFromDetailAction } from "@/modules/deals/actions";
import { DealStatusActions } from "@/modules/deals/components/deal-status-actions";
import { getDealById } from "@/modules/deals/queries";
import { canDeleteDeal } from "@/modules/deals/status";
import { EntityHeader, EntityTabs, QuickActions } from "@/modules/customer-file/components/header";
import {
  ActivitiesSection,
  EmailsSection,
  EventsSection,
  FilesSection,
  InvoicesSection,
  NextStepSection,
  NotesSection,
  QuotesSection,
  RemindersSection,
  TasksSection,
} from "@/modules/customer-file/components/sections";
import { parseTab, type FileScope, type TabKey } from "@/modules/customer-file/scope";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

type DealDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Übersicht" },
  { key: "history", label: "Verlauf" },
  { key: "sales", label: "Angebote & Rechnungen" },
  { key: "tasks", label: "Aufgaben & Termine" },
  { key: "files", label: "Dateien" },
];

export async function generateMetadata({ params }: DealDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const deal = await getDealById(id);
  return { title: deal ? `${deal.name} – RDEvolution CRM` : "Deal – RDEvolution CRM" };
}

export default async function DealDetailPage({ params, searchParams }: DealDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const tab = parseTab(
    (await searchParams).tab,
    TABS.map((t) => t.key),
  );
  const deal = await getDealById(id);
  if (!deal) {
    notFound();
  }
  const scope: FileScope = { kind: "deal", id: deal.id };
  const basePath = `/deals/${deal.id}`;
  const stage = deal.leadId ? await leadStageLabel(deal.leadId) : null;

  return (
    <div className="flex flex-col gap-5">
      <EntityHeader
        title={deal.name}
        subtitle={
          <Link href={`/companies/${deal.company.id}`} className="hover:underline">
            {deal.company.name}
          </Link>
        }
        badges={
          <>
            <Badge variant={deal.status === "WON" ? "gold" : "neutral"}>
              {DEAL_STATUS_LABELS[deal.status]}
            </Badge>
            {deal.status === "LOST" && deal.lostReason && (
              <span className="text-sm text-muted">
                {DEAL_LOST_REASON_LABELS[deal.lostReason]}
                {deal.lostReasonNote ? ` – ${deal.lostReasonNote}` : ""}
              </span>
            )}
          </>
        }
        assignee={deal.assignedUser}
        facts={[
          { label: "Wert", value: formatCentsAsEuro(deal.valueCents) },
          {
            label: "Kontakt",
            value: deal.contact ? (
              <Link href={`/contacts/${deal.contact.id}`} className="hover:underline">
                {contactDisplayName(deal.contact)}
              </Link>
            ) : (
              "–"
            ),
          },
          {
            label: "Lead / Pipeline-Stufe",
            value: deal.lead ? (
              <Link href={`/leads/${deal.lead.id}`} className="hover:underline">
                {deal.lead.title}
                {stage ? ` · ${stage}` : ""}
              </Link>
            ) : (
              "–"
            ),
          },
          {
            label: "Erwarteter Abschluss",
            value: deal.expectedCloseDate ? DATE_FORMATTER.format(deal.expectedCloseDate) : "–",
          },
        ]}
        actions={
          <>
            <Link href={`${basePath}/edit`}>
              <Button variant="secondary">Bearbeiten</Button>
            </Link>
            {canDeleteDeal(deal.status) && (
              <EntityDeleteDialog
                entity="Deal"
                name={deal.name}
                triggerLabel="Deal löschen"
                deleteAction={deleteDealFromDetailAction.bind(null, deal.id, deal.version)}
              />
            )}
          </>
        }
      />

      <QuickActions
        scope={scope}
        basePath={basePath}
        assignedUserId={deal.assignedUserId}
        canEmail={!!deal.contact?.email}
        canSetFollowUp={!!deal.leadId}
      />

      <EntityTabs basePath={basePath} tabs={TABS} active={tab} />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <NextStepSection scope={scope} user={user} dealLeadId={deal.leadId} />
            <RemindersSection scope={scope} user={user} dealLeadId={deal.leadId} />
            <NotesSection scope={scope} />
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Deal-Status ändern</CardTitle>
              </CardHeader>
              <CardContent>
                <DealStatusActions dealId={deal.id} status={deal.status} version={deal.version} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Weitere Angaben</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Fact label="Leistung" value={POTENTIAL_NEED_LABELS[deal.service]} />
                <Fact
                  label="Wahrscheinlichkeit"
                  value={deal.probability !== null ? `${deal.probability}%` : undefined}
                />
                <Fact
                  label="Tatsächlicher Abschluss"
                  value={deal.closedAt ? DATE_FORMATTER.format(deal.closedAt) : undefined}
                />
                {deal.description && (
                  <p className="whitespace-pre-wrap text-black/80">{deal.description}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivitiesSection scope={scope} />
          </div>
          <EmailsSection scope={scope} canCompose={!!deal.contact?.email} />
        </div>
      )}

      {tab === "sales" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <QuotesSection scope={scope} />
          <InvoicesSection scope={scope} />
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TasksSection scope={scope} assignedUserId={deal.assignedUserId} />
          <EventsSection scope={scope} assignedUserId={deal.assignedUserId} />
        </div>
      )}

      {tab === "files" && (
        <div className="max-w-2xl">
          <FilesSection scope={scope} user={user} limit={50} />
        </div>
      )}
    </div>
  );
}

async function leadStageLabel(leadId: string): Promise<string | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { stage: { select: { name: true } } },
  });
  return lead?.stage.name ?? null;
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={value ? "text-black/80" : "text-muted"}>{value || "–"}</p>
    </div>
  );
}
