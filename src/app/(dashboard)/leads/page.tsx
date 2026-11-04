import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { toURLSearchParams } from "@/lib/search-params";
import { LeadFiltersBar } from "@/modules/leads/components/lead-filters";
import { LeadTable } from "@/modules/leads/components/lead-table";
import { listLeads } from "@/modules/leads/queries";
import { leadFiltersSchema } from "@/validations/lead";

export const metadata: Metadata = {
  title: "Leads – RDEvolution CRM",
};

type LeadsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const rawParams = await searchParams;
  const filters = leadFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);

  const { leads, totalCount, totalPages } = await listLeads(filters, pagination);
  const currentSearchParams = toURLSearchParams(rawParams);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black">Leads</h2>
        <Link
          href="/leads/new"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          + Lead erstellen
        </Link>
      </div>

      <Suspense>
        <LeadFiltersBar />
      </Suspense>

      <Card>
        <LeadTable leads={leads} filters={filters} searchParams={currentSearchParams} />
        {leads.length > 0 && (
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
