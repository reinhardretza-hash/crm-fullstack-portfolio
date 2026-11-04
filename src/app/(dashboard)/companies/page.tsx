import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { toURLSearchParams } from "@/lib/search-params";
import { CompanyFiltersBar } from "@/modules/companies/components/company-filters";
import { CompanyTable } from "@/modules/companies/components/company-table";
import { listCompanies } from "@/modules/companies/queries";
import { companyFiltersSchema } from "@/validations/company";

export const metadata: Metadata = {
  title: "Unternehmen – RDEvolution CRM",
};

type CompaniesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const rawParams = await searchParams;
  const filters = companyFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);

  const { companies, totalCount, totalPages } = await listCompanies(filters, pagination);

  const currentSearchParams = toURLSearchParams(rawParams);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black">Unternehmen</h2>
        <Link
          href="/companies/new"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          + Unternehmen erstellen
        </Link>
      </div>

      {rawParams.deleted === "1" && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Unternehmen gelöscht. Historische Verknüpfungen bleiben erhalten.
        </p>
      )}
      <Suspense>
        <CompanyFiltersBar />
      </Suspense>

      <Card>
        <CompanyTable companies={companies} filters={filters} searchParams={currentSearchParams} />
        {companies.length > 0 && (
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
