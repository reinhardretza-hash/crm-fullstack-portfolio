import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CompaniesIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COMPANY_STATUS_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import { buildFilterUrl } from "@/lib/search-params";
import type { CompanyFilters } from "@/validations/company";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

type CompanyListItem = {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  status: keyof typeof COMPANY_STATUS_LABELS;
  source: keyof typeof SOURCE_LABELS | null;
  updatedAt: Date;
  assignedUser: { firstName: string; lastName: string } | null;
  _count: { contacts: number };
};

type CompanyTableProps = {
  companies: CompanyListItem[];
  filters: CompanyFilters;
  searchParams: URLSearchParams;
};

function SortableHead({
  label,
  sortKey,
  filters,
  searchParams,
}: {
  label: string;
  sortKey: CompanyFilters["sort"];
  filters: CompanyFilters;
  searchParams: URLSearchParams;
}) {
  const isActive = filters.sort === sortKey;
  const nextDirection = isActive && filters.direction === "asc" ? "desc" : "asc";
  const href = buildFilterUrl("/companies", searchParams, {
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

export function CompanyTable({ companies, filters, searchParams }: CompanyTableProps) {
  if (companies.length === 0) {
    return (
      <EmptyState
        icon={<CompaniesIcon className="h-8 w-8" />}
        title="Noch keine Unternehmen vorhanden."
        description="Lege dein erstes Unternehmen an, um mit dem Vertrieb zu starten."
        action={
          <Link
            href="/companies/new"
            className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
          >
            + Unternehmen erstellen
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
            label="Unternehmen"
            sortKey="name"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Branche</TableHead>
          <SortableHead label="Ort" sortKey="city" filters={filters} searchParams={searchParams} />
          <TableHead>Ansprechpartner</TableHead>
          <SortableHead
            label="Status"
            sortKey="status"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Quelle</TableHead>
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
        {companies.map((company) => (
          <TableRow key={company.id}>
            <TableCell className="font-medium text-black">
              <Link href={`/companies/${company.id}`} className="hover:underline">
                {company.name}
              </Link>
            </TableCell>
            <TableCell>{company.industry ?? "–"}</TableCell>
            <TableCell>{company.city ?? "–"}</TableCell>
            <TableCell>{company._count.contacts}</TableCell>
            <TableCell>
              <Badge variant="neutral">{COMPANY_STATUS_LABELS[company.status]}</Badge>
            </TableCell>
            <TableCell>{company.source ? SOURCE_LABELS[company.source] : "–"}</TableCell>
            <TableCell>
              {company.assignedUser
                ? `${company.assignedUser.firstName} ${company.assignedUser.lastName}`
                : "–"}
            </TableCell>
            <TableCell>{DATE_FORMATTER.format(company.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
