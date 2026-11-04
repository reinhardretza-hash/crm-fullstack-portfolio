import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { toURLSearchParams } from "@/lib/search-params";
import { ContactFiltersBar } from "@/modules/contacts/components/contact-filters";
import { ContactTable } from "@/modules/contacts/components/contact-table";
import { listContacts } from "@/modules/contacts/queries";
import { contactFiltersSchema } from "@/validations/contact";

export const metadata: Metadata = {
  title: "Kontakte – RDEvolution CRM",
};

type ContactsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const rawParams = await searchParams;
  const filters = contactFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);

  const { contacts, totalCount, totalPages } = await listContacts(filters, pagination);

  const currentSearchParams = toURLSearchParams(rawParams);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black">Kontakte</h2>
        <Link
          href="/contacts/new"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          + Kontakt erstellen
        </Link>
      </div>

      {rawParams.deleted === "1" && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Kontakt gelöscht. Historische Verknüpfungen bleiben erhalten.
        </p>
      )}
      <Suspense>
        <ContactFiltersBar />
      </Suspense>

      <Card>
        <ContactTable contacts={contacts} filters={filters} searchParams={currentSearchParams} />
        {contacts.length > 0 && (
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        )}
      </Card>
    </div>
  );
}
