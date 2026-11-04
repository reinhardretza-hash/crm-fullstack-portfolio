import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactsIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTACT_STATUS_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import { buildFilterUrl } from "@/lib/search-params";
import type { ContactFilters } from "@/validations/contact";
import { contactDisplayName } from "../helpers";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", { dateStyle: "short" });

type ContactListItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  status: keyof typeof CONTACT_STATUS_LABELS;
  source: keyof typeof SOURCE_LABELS | null;
  updatedAt: Date;
  company: { id: string; name: string } | null;
  assignedUser: { firstName: string; lastName: string } | null;
};

type ContactTableProps = {
  contacts: ContactListItem[];
  filters: ContactFilters;
  searchParams: URLSearchParams;
};

function SortableHead({
  label,
  sortKey,
  filters,
  searchParams,
}: {
  label: string;
  sortKey: ContactFilters["sort"];
  filters: ContactFilters;
  searchParams: URLSearchParams;
}) {
  const isActive = filters.sort === sortKey;
  const nextDirection = isActive && filters.direction === "asc" ? "desc" : "asc";
  const href = buildFilterUrl("/contacts", searchParams, {
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

export function ContactTable({ contacts, filters, searchParams }: ContactTableProps) {
  if (contacts.length === 0) {
    return (
      <EmptyState
        icon={<ContactsIcon className="h-8 w-8" />}
        title="Noch keine Kontakte vorhanden."
        description="Lege deinen ersten Kontakt an."
        action={
          <Link
            href="/contacts/new"
            className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
          >
            + Kontakt erstellen
          </Link>
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Name" sortKey="name" filters={filters} searchParams={searchParams} />
          <TableHead>Position</TableHead>
          <TableHead>Unternehmen</TableHead>
          <TableHead>E-Mail</TableHead>
          <TableHead>Telefon</TableHead>
          <TableHead>Quelle</TableHead>
          <SortableHead
            label="Status"
            sortKey="status"
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
        {contacts.map((contact) => (
          <TableRow key={contact.id}>
            <TableCell className="font-medium text-black">
              <Link href={`/contacts/${contact.id}`} className="hover:underline">
                {contactDisplayName(contact)}
              </Link>
            </TableCell>
            <TableCell>{contact.jobTitle ?? "–"}</TableCell>
            <TableCell>
              {contact.company ? (
                <Link href={`/companies/${contact.company.id}`} className="hover:underline">
                  {contact.company.name}
                </Link>
              ) : (
                "–"
              )}
            </TableCell>
            <TableCell>{contact.email ?? "–"}</TableCell>
            <TableCell>{contact.phone ?? "–"}</TableCell>
            <TableCell>{contact.source ? SOURCE_LABELS[contact.source] : "–"}</TableCell>
            <TableCell>
              <Badge variant="neutral">{CONTACT_STATUS_LABELS[contact.status]}</Badge>
            </TableCell>
            <TableCell>
              {contact.assignedUser
                ? `${contact.assignedUser.firstName} ${contact.assignedUser.lastName}`
                : "–"}
            </TableCell>
            <TableCell>{DATE_FORMATTER.format(contact.updatedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
