import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { toURLSearchParams } from "@/lib/search-params";
import { DealFiltersBar } from "@/modules/deals/components/deal-filters";
import { DealTable } from "@/modules/deals/components/deal-table";
import { listDeals } from "@/modules/deals/queries";
import { dealFiltersSchema } from "@/validations/deal";

export const metadata: Metadata = {
  title: "Deals – RDEvolution CRM",
};

type DealsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const rawParams = await searchParams;
  const filters = dealFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);

  const { deals, totalCount, totalPages } = await listDeals(filters, pagination);
  const currentSearchParams = toURLSearchParams(rawParams);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black">Deals</h2>
        <Link
          href="/deals/new"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          + Deal erstellen
        </Link>
      </div>

      <Suspense>
        <DealFiltersBar />
      </Suspense>
      {rawParams.deleted === "1" && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Deal gelöscht. Historische Verknüpfungen bleiben erhalten.
        </p>
      )}

      <Card>
        <DealTable deals={deals} filters={filters} searchParams={currentSearchParams} />
        {deals.length > 0 && (
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
