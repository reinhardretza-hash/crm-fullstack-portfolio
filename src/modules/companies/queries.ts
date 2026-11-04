import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import type { CompanyFilters } from "@/validations/company";

// Zentrale Stelle für den Soft-Delete-Filter - jede Company-Query läuft
// hier durch, damit `deletedAt: null` nie an einer Stelle vergessen wird.
function baseWhere(filters: CompanyFilters): Prisma.CompanyWhereInput {
  return {
    deletedAt: null,
    status: filters.status,
    source: filters.source,
    companySize: filters.companySize,
    assignedUserId: filters.assignedUserId,
    industry: filters.industry ? { equals: filters.industry, mode: "insensitive" } : undefined,
    tags: filters.tag ? { some: { tag: { normalizedName: filters.tag } } } : undefined,
    OR: filters.q
      ? [
          { name: { contains: filters.q, mode: "insensitive" } },
          { website: { contains: filters.q, mode: "insensitive" } },
          { email: { contains: filters.q, mode: "insensitive" } },
          { city: { contains: filters.q, mode: "insensitive" } },
        ]
      : undefined,
  };
}

export async function listCompanies(filters: CompanyFilters, pagination: PaginationParams) {
  const where = baseWhere(filters);
  const { skip, take } = toSkipTake(pagination);

  const [companies, totalCount] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: { [filters.sort]: filters.direction },
      skip,
      take,
      include: {
        assignedUser: { select: { firstName: true, lastName: true } },
        _count: { select: { contacts: { where: { deletedAt: null } } } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    companies,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
  };
}

export async function getCompanyById(id: string) {
  return prisma.company.findFirst({
    where: { id, deletedAt: null },
    include: {
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      tags: { include: { tag: true } },
      needs: true,
      contacts: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, firstName: true, lastName: true, jobTitle: true, email: true },
      },
      // Notizen/Aktivitäten werden auf der Kundenakte begrenzt und gezielt geladen
      // (src/modules/customer-file), nicht unbegrenzt hier.
    },
  });
}

// Für Dropdown-Auswahl (z. B. Kontakt einem Unternehmen zuordnen) - bewusst
// schlank, keine volle Paginierung nötig für ein internes Auswahlfeld.
export async function listCompanyOptions() {
  return prisma.company.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 500,
  });
}
