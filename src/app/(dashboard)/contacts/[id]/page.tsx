import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityDeleteDialog } from "@/components/ui/entity-delete-dialog";
import { CONTACT_STATUS_LABELS, LEAD_STATUS_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { deleteContactFromDetailAction } from "@/modules/contacts/actions";
import { contactDisplayName } from "@/modules/contacts/helpers";
import { getContactById } from "@/modules/contacts/queries";
import { DealCompactList } from "@/modules/deals/components/deal-compact-list";
import { listDealsForContact } from "@/modules/deals/queries";
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

type ContactDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Übersicht" },
  { key: "history", label: "Verlauf" },
  { key: "sales", label: "Vertrieb" },
  { key: "tasks", label: "Aufgaben & Termine" },
  { key: "files", label: "Dateien" },
];

export async function generateMetadata({ params }: ContactDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const contact = await getContactById(id);
  return {
    title: contact
      ? `${contactDisplayName(contact)} – RDEvolution CRM`
      : "Kontakt – RDEvolution CRM",
  };
}

export default async function ContactDetailPage({ params, searchParams }: ContactDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const tab = parseTab(
    (await searchParams).tab,
    TABS.map((t) => t.key),
  );
  const contact = await getContactById(id);
  if (!contact) {
    notFound();
  }
  const scope: FileScope = { kind: "contact", id: contact.id };
  const basePath = `/contacts/${contact.id}`;

  return (
    <div className="flex flex-col gap-5">
      <EntityHeader
        title={contactDisplayName(contact)}
        badges={
          <>
            <Badge variant="neutral">{CONTACT_STATUS_LABELS[contact.status]}</Badge>
            {contact.jobTitle && <span className="text-sm text-muted">{contact.jobTitle}</span>}
          </>
        }
        assignee={contact.assignedUser}
        facts={[
          {
            label: "Unternehmen",
            value: contact.company ? (
              <Link href={`/companies/${contact.company.id}`} className="hover:underline">
                {contact.company.name}
              </Link>
            ) : (
              "–"
            ),
          },
          { label: "E-Mail", value: contact.email ?? "–" },
          { label: "Telefon", value: contact.phone ?? contact.mobile ?? "–" },
          { label: "Position", value: contact.jobTitle ?? "–" },
          {
            label: "Tags",
            value:
              contact.tags.length === 0 ? (
                "–"
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {contact.tags.map((contactTag) => (
                    <Badge key={contactTag.id} variant="neutral">
                      {contactTag.tag.name}
                    </Badge>
                  ))}
                </span>
              ),
          },
        ]}
        actions={
          <>
            <Link href={`${basePath}/edit`}>
              <Button variant="secondary">Bearbeiten</Button>
            </Link>
            <EntityDeleteDialog
              entity="Kontakt"
              name={contactDisplayName(contact)}
              deleteAction={deleteContactFromDetailAction.bind(null, contact.id)}
            />
          </>
        }
      />

      <QuickActions
        scope={scope}
        basePath={basePath}
        assignedUserId={contact.assignedUserId}
        canEmail={!!contact.email}
      />

      <EntityTabs basePath={basePath} tabs={TABS} active={tab} />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <NextStepSection scope={scope} user={user} />
            <RemindersSection scope={scope} user={user} />
            <NotesSection scope={scope} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Weitere Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <Fact label="Mobil" value={contact.mobile} />
              <Fact label="LinkedIn" value={contact.linkedinUrl} />
              <Fact label="Website" value={contact.website} />
              <Fact
                label="Quelle"
                value={contact.source ? SOURCE_LABELS[contact.source] : undefined}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "history" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivitiesSection scope={scope} />
          </div>
          <EmailsSection scope={scope} canCompose={!!contact.email} />
        </div>
      )}

      {tab === "sales" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ContactDeals contactId={contact.id} />
          <ContactLeads contactId={contact.id} />
          <QuotesSection scope={scope} />
          <InvoicesSection scope={scope} />
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TasksSection scope={scope} assignedUserId={contact.assignedUserId} />
          <EventsSection scope={scope} assignedUserId={contact.assignedUserId} />
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

async function ContactDeals({ contactId }: { contactId: string }) {
  const deals = await listDealsForContact(contactId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deals ({deals.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <DealCompactList deals={deals.slice(0, 5)} showExpectedCloseDate />
        {deals.length > 5 && (
          <p className="mt-3 text-xs text-muted">Die neuesten 5 von {deals.length} Deals.</p>
        )}
      </CardContent>
    </Card>
  );
}

async function ContactLeads({ contactId }: { contactId: string }) {
  const where = { contactId, deletedAt: null };
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, status: true },
    }),
    prisma.lead.count({ where }),
  ]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leads ({total})</CardTitle>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="text-sm text-muted">Keine Leads vorhanden.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {leads.map((lead) => (
              <li key={lead.id} className="break-words">
                <Link href={`/leads/${lead.id}`} className="font-medium text-black hover:underline">
                  {lead.title}
                </Link>
                <span className="text-xs text-muted"> · {LEAD_STATUS_LABELS[lead.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={value ? "text-black/80 break-words" : "text-muted"}>{value || "–"}</p>
    </div>
  );
}
