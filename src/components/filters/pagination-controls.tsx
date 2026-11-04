"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";
import { buildFilterUrl } from "@/lib/search-params";
import { Button } from "@/components/ui/button";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
};

export function PaginationControls({
  page,
  pageSize,
  totalPages,
  totalCount,
}: PaginationControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function goToPage(nextPage: number) {
    router.push(buildFilterUrl(pathname, searchParams, { page: String(nextPage) }));
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-black/10 px-4 py-3 sm:flex-row">
      <p className="text-xs text-muted">
        {totalCount} Einträge · Seite {page} von {totalPages}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-secondary">
          Pro Seite
          <select
            value={pageSize}
            onChange={(event) =>
              router.push(buildFilterUrl(pathname, searchParams, { pageSize: event.target.value }))
            }
            className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm outline-none focus:border-[var(--gold)]"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5">
          <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            Zurück
          </Button>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            Weiter
          </Button>
        </div>
      </div>
    </div>
  );
}
