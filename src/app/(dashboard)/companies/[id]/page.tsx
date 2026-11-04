import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { EntityDeleteDialog } from "@/components/ui/entity-delete-dialog";
import { ContactsIcon } from "@/components/ui/icons";
import { COMPANY_STATUS_LABELS, POTENTIAL_NEED_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import { requireUser } from "@/server/rbac";
import { deleteCompanyFromDetailAction } from "@/modules/companies/actions";
import { getCompanyById } from "@/modules/companies/queries";
import { contactDisplayName } from "@/modules/contacts/helpers";
import { DealCompactList } from "@/modules/deals/components/deal-compact-list";
import { listDealsForCompany } from "@/modules/deals/queries";
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

type CompanyDetailPageProps = {
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

export async function generateMetadata({ params }: CompanyDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const company = await getCompanyById(id);
  return { title: company ? `${company.name} – RDEvolution CRM` : "Unternehmen – RDEvolution CRM" };
}

export default async function CompanyDetailPage({ params, searchParams }: CompanyDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const tab = parseTab(
    (await searchParams).tab,
    TABS.map((t) => t.key),
  );
  const company = await getCompanyById(id);
  if (!company) {
    notFound();
  }
  const scope: FileScope = { kind: "company", id: company.id };
  const basePath = `/companies/${company.id}`;
  const address = [
    company.street,
    [company.postalCode, company.city].filter(Boolean).join(" "),
    company.country,
  ]
    .filter(Boolean)
    .join(", ");
  const mainContacts = company.contacts.slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <EntityHeader
        title={company.name}
        badges={
          <>
            <Badge variant="neutral">{COMPANY_STATUS_LABELS[company.status]}</Badge>
            {company.industry && <span className="text-sm text-muted">{company.industry}</span>}
          </>
        }
        assignee={company.assignedUser}
        facts={[
          {
            label: "Ansprechpartner",
            value:
              mainContacts.length === 0 ? (
                "–"
              ) : (
                <>
                  {mainContacts.map((contact, index) => (
                    <span key={contact.id}>
                      {index > 0 && ", "}
                      <Link href={`/contacts/${contact.id}`} className="hover:underline">
                        {contactDisplayName(contact)}
                      </Link>
                    </span>
                  ))}
                  {company.contacts.length > 3 && ` +${company.contacts.length - 3}`}
                </>
              ),
          },
          { label: "Telefon", value: company.phone ?? "–" },
          { label: "E-Mail", value: company.email ?? "–" },
          {
            label: "Website",
            value: company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:underline"
              >
                {company.website}
              </a>
            ) : (
              "–"
            ),
          },
          { label: "Adresse", value: address || "–" },
          {
            label: "Tags",
            value:
              company.tags.length === 0 ? (
                "–"
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {company.tags.map((companyTag) => (
                    <Badge key={companyTag.id} variant="neutral">
                      {companyTag.tag.name}
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
              entity="Unternehmen"
              name={company.name}
              deleteAction={deleteCompanyFromDetailAction.bind(null, company.id)}
            />
          </>
        }
      />

      <QuickActions
        scope={scope}
        basePath={basePath}
        assignedUserId={company.assignedUserId}
        canEmail
      />

      <EntityTabs basePath={basePath} tabs={TABS} active={tab} />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <NextStepSection scope={scope} user={user} />
            <RemindersSection scope={scope} user={user} />
            <NotesSection scope={scope} />
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Weitere Stammdaten</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Fact label="Mitarbeiterzahl" value={company.employeeCount?.toString()} />
                <Fact
                  label="Quelle"
                  value={company.source ? SOURCE_LABELS[company.source] : undefined}
                />
                {company.needs.length > 0 && (
                  <div>
                    <p className="text-xs text-muted">Bedarf</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {company.needs.map((need) => (
                        <Badge key={need.id} variant="gold">
                          {POTENTIAL_NEED_LABELS[need.need]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {company.description && (
                  <p className="whitespace-pre-wrap text-black/80">{company.description}</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Ansprechpartner ({company.contacts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {company.contacts.length === 0 ? (
                  <EmptyState
                    icon={<ContactsIcon className="h-8 w-8" />}
                    title="Noch keine Ansprechpartner."
                  />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {company.contacts.slice(0, 5).map((contact) => (
                      <li key={contact.id} className="text-sm break-words">
                        <Link
                          href={`/contacts/${contact.id}`}
                          className="text-black hover:underline"
                        >
                          {contactDisplayName(contact)}
                        </Link>
                        {contact.jobTitle && (
                          <span className="text-muted"> · {contact.jobTitle}</span>
                        )}
                      </li>
                    ))}
                  </ul>
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
          <EmailsSection scope={scope} canCompose />
        </div>
      )}

      {tab === "sales" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CompanyDeals companyId={company.id} />
          <QuotesSection scope={scope} />
          <InvoicesSection scope={scope} />
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TasksSection scope={scope} assignedUserId={company.assignedUserId} />
          <EventsSection scope={scope} assignedUserId={company.assignedUserId} />
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

async function CompanyDeals({ companyId }: { companyId: string }) {
  const deals = await listDealsForCompany(companyId);
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

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={value ? "text-black/80" : "text-muted"}>{value || "–"}</p>
    </div>
  );
}
