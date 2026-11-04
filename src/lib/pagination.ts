export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;

export type PaginationParams = {
  page: number;
  pageSize: PageSize;
};

// Liest Seite/Seitengröße robust aus URL Search Params - ungültige/fehlende
// Werte fallen auf sinnvolle Defaults zurück statt einen Fehler zu werfen,
// damit eine manuell editierte URL nie zu einer kaputten Seite führt.
export function parsePaginationParams(
  searchParams: Record<string, string | string[] | undefined>,
): PaginationParams {
  const rawPage = Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page;
  const rawPageSize = Array.isArray(searchParams.pageSize)
    ? searchParams.pageSize[0]
    : searchParams.pageSize;

  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedPageSize = Number.parseInt(rawPageSize ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = PAGE_SIZE_OPTIONS.includes(parsedPageSize as PageSize)
    ? (parsedPageSize as PageSize)
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize };
}

export function toSkipTake({ page, pageSize }: PaginationParams): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function getTotalPages(totalCount: number, pageSize: PageSize): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
