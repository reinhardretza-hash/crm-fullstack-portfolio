import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadsIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeadStatus } from "@/generated/prisma/client";
import { PRIORITY_LABELS, POTENTIAL_NEED_LABELS } from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";
import { buildFilterUrl } from "@/lib/search-params";
import type { LeadFilters } from "@/validations/lead";
import { contactDisplayName } from "@/modules/contacts/helpers";
import { isLeadFollowUpOverdue } from "../stage-status";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

type LeadListItem = {
  id: string;
  title: string;
  interest: keyof typeof POTENTIAL_NEED_LABELS | null;
  priority: keyof typeof PRIORITY_LABELS;
  expectedValueCents: number | null;
  score: number;
  status: LeadStatus;
  nextFollowUpAt: Date | null;
  updatedAt: Date;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  stage: { id: string; name: string; isWonStage: boolean; isLostStage: boolean };
  assignedUser: { firstName: string; lastName: string } | null;
};

type LeadTableProps = {
  leads: LeadListItem[];
  filters: LeadFilters;
  searchParams: URLSearchParams;
};

function SortableHead({
  label,
  sortKey,
  filters,
  searchParams,
}: {
  label: string;
  sortKey: LeadFilters["sort"];
  filters: LeadFilters;
  searchParams: URLSearchParams;
}) {
  const isActive = filters.sort === sortKey;
  const nextDirection = isActive && filters.direction === "asc" ? "desc" : "asc";
  const href = buildFilterUrl("/leads", searchParams, {
    sort: sortKey,
    direction: nextDirection,
    page: "1",
  });

  return (
    <TableHead>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-black">
        {label}
        {isActive && <span aria-hidden="true">{filters.direction === "asc" ? "↑" : "↓"}</span>}
      </Link>
    </TableHead>
  );
}

export function LeadTable({ leads, filters, searchParams }: LeadTableProps) {
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<LeadsIcon className="h-8 w-8" />}
        title="Noch keine Leads vorhanden."
        description="Lege deinen ersten Lead an, um die Pipeline zu füllen."
        action={
          <Link
            href="/leads/new"
            className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
          >
            + Lead erstellen
          </Link>
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead
            label="Lead"
            sortKey="title"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Unternehmen</TableHead>
          <TableHead>Kontakt</TableHead>
          <TableHead>Interesse</TableHead>
          <TableHead>Pipeline-Stufe</TableHead>
          <SortableHead
            label="Score"
            sortKey="score"
            filters={filters}
            searchParams={searchParams}
          />
          <SortableHead
            label="Priorität"
            sortKey="priority"
            filters={filters}
            searchParams={searchParams}
          />
          <SortableHead
            label="Erwarteter Wert"
            sortKey="expectedValueCents"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Verantwortlicher</TableHead>
          <SortableHead
            label="Nächster Follow-up"
            sortKey="nextFollowUpAt"
            filters={filters}
            searchParams={searchParams}
          />
          <SortableHead
            label="Aktualisiert"
            sortKey="updatedAt"
            filters={filters}
            searchParams={searchParams}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const overdue = isLeadFollowUpOverdue(lead);
          return (
            <TableRow key={lead.id}>
              <TableCell className="font-medium text-black">
                <Link href={`/leads/${lead.id}`} className="hover:underline">
                  {lead.title}
                </Link>
              </TableCell>
              <TableCell>
                {lead.company ? (
                  <Link href={`/companies/${lead.company.id}`} className="hover:underline">
                    {lead.company.name}
                  </Link>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell>
                {lead.contact ? (
                  <Link href={`/contacts/${lead.contact.id}`} className="hover:underline">
                    {contactDisplayName(lead.contact)}
                  </Link>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell>{lead.interest ? POTENTIAL_NEED_LABELS[lead.interest] : "–"}</TableCell>
              <TableCell>{lead.stage.name}</TableCell>
              <TableCell>{lead.score}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    lead.priority === "VERY_HIGH" || lead.priority === "HIGH" ? "gold" : "neutral"
                  }
                >
                  {PRIORITY_LABELS[lead.priority]}
                </Badge>
              </TableCell>
              <TableCell>
                {lead.expectedValueCents !== null
                  ? formatCentsAsEuro(lead.expectedValueCents)
                  : "–"}
              </TableCell>
              <TableCell>
                {lead.assignedUser
                  ? `${lead.assignedUser.firstName} ${lead.assignedUser.lastName}`
                  : "–"}
              </TableCell>
              <TableCell>
                {lead.nextFollowUpAt ? (
                  <span className={overdue ? "font-medium text-red-600" : undefined}>
                    {DATE_FORMATTER.format(lead.nextFollowUpAt)}
                    {overdue && " (überfällig)"}
                  </span>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell>{DATE_FORMATTER.format(lead.updatedAt)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
