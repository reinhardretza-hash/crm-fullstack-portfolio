import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DealsIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DealStatus } from "@/generated/prisma/client";
import { DEAL_STATUS_LABELS, POTENTIAL_NEED_LABELS } from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";
import { buildFilterUrl } from "@/lib/search-params";
import type { DealFilters } from "@/validations/deal";
import { contactDisplayName } from "@/modules/contacts/helpers";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

type DealListItem = {
  id: string;
  name: string;
  service: keyof typeof POTENTIAL_NEED_LABELS;
  status: DealStatus;
  valueCents: number;
  probability: number | null;
  expectedCloseDate: Date | null;
  updatedAt: Date;
  company: { id: string; name: string };
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  assignedUser: { firstName: string; lastName: string } | null;
};

type DealTableProps = {
  deals: DealListItem[];
  filters: DealFilters;
  searchParams: URLSearchParams;
};

function SortableHead({
  label,
  sortKey,
  filters,
  searchParams,
}: {
  label: string;
  sortKey: DealFilters["sort"];
  filters: DealFilters;
  searchParams: URLSearchParams;
}) {
  const isActive = filters.sort === sortKey;
  const nextDirection = isActive && filters.direction === "asc" ? "desc" : "asc";
  const href = buildFilterUrl("/deals", searchParams, {
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

export function DealTable({ deals, filters, searchParams }: DealTableProps) {
  if (deals.length === 0) {
    return (
      <EmptyState
        icon={<DealsIcon className="h-8 w-8" />}
        title="Noch keine Deals vorhanden."
        description="Lege deinen ersten Deal an, um Verkaufschancen zu verfolgen."
        action={
          <Link
            href="/deals/new"
            className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
          >
            + Deal erstellen
          </Link>
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Deal" sortKey="name" filters={filters} searchParams={searchParams} />
          <TableHead>Unternehmen</TableHead>
          <TableHead>Kontakt</TableHead>
          <TableHead>Leistung</TableHead>
          <TableHead>Status</TableHead>
          <SortableHead
            label="Wert"
            sortKey="valueCents"
            filters={filters}
            searchParams={searchParams}
          />
          <SortableHead
            label="Wahrscheinlichkeit"
            sortKey="probability"
            filters={filters}
            searchParams={searchParams}
          />
          <SortableHead
            label="Erwarteter Abschluss"
            sortKey="expectedCloseDate"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Verantwortlicher</TableHead>
          <SortableHead
            label="Aktualisiert"
            sortKey="updatedAt"
            filters={filters}
            searchParams={searchParams}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((deal) => (
          <TableRow key={deal.id}>
            <TableCell className="font-medium text-black">
              <Link href={`/deals/${deal.id}`} className="hover:underline">
                {deal.name}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/companies/${deal.company.id}`} className="hover:underline">
                {deal.company.name}
              </Link>
            </TableCell>
            <TableCell>
              {deal.contact ? (
                <Link href={`/contacts/${deal.contact.id}`} className="hover:underline">
                  {contactDisplayName(deal.contact)}
                </Link>
              ) : (
                "–"
              )}
            </TableCell>
            <TableCell>{POTENTIAL_NEED_LABELS[deal.service]}</TableCell>
            <TableCell>
              <Badge variant={deal.status === "WON" ? "gold" : "neutral"}>
                {DEAL_STATUS_LABELS[deal.status]}
              </Badge>
            </TableCell>
            <TableCell>{formatCentsAsEuro(deal.valueCents)}</TableCell>
            <TableCell>{deal.probability !== null ? `${deal.probability}%` : "–"}</TableCell>
            <TableCell>
              {deal.expectedCloseDate ? DATE_FORMATTER.format(deal.expectedCloseDate) : "–"}
            </TableCell>
            <TableCell>
              {deal.assignedUser
                ? `${deal.assignedUser.firstName} ${deal.assignedUser.lastName}`
                : "–"}
            </TableCell>
            <TableCell>{DATE_FORMATTER.format(deal.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
