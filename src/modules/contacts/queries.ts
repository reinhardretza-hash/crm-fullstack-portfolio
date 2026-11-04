import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import type { ContactFilters } from "@/validations/contact";

function baseWhere(filters: ContactFilters): Prisma.ContactWhereInput {
  return {
    deletedAt: null,
    status: filters.status,
    source: filters.source,
    companyId: filters.companyId,
    assignedUserId: filters.assignedUserId,
    tags: filters.tag ? { some: { tag: { normalizedName: filters.tag } } } : undefined,
    OR: filters.q
      ? [
          { firstName: { contains: filters.q, mode: "insensitive" } },
          { lastName: { contains: filters.q, mode: "insensitive" } },
          { email: { contains: filters.q, mode: "insensitive" } },
          { phone: { contains: filters.q, mode: "insensitive" } },
          { mobile: { contains: filters.q, mode: "insensitive" } },
          { linkedinUrl: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}

// "name" ist kein echtes DB-Feld (kein persistiertes fullName) - sortiert
// stattdessen über lastName, dann firstName.
function orderBy(filters: ContactFilters): Prisma.ContactOrderByWithRelationInput[] {
  if (filters.sort === "name") {
    return [{ lastName: filters.direction }, { firstName: filters.direction }];
  }
  return [{ [filters.sort]: filters.direction }];
}

export async function listContacts(filters: ContactFilters, pagination: PaginationParams) {
  const where = baseWhere(filters);
  const { skip, take } = toSkipTake(pagination);

  const [contacts, totalCount] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: orderBy(filters),
      skip,
      take,
      include: {
        company: { select: { id: true, name: true } },
        assignedUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    contacts,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
  };
}

export async function getContactById(id: string) {
  return prisma.contact.findFirst({
    where: { id, deletedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, firstName: true, lastName: true } },
      tags: { include: { tag: true } },
      // Notizen/Aktivitäten werden auf der Kundenakte begrenzt und gezielt geladen
      // (src/modules/customer-file), nicht unbegrenzt hier.
    },
  });
}

// Für Dropdown-Auswahl (z. B. Lead einem Kontakt zuordnen).
export async function listContactOptions() {
  return prisma.contact.findMany({
    where: { deletedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, companyId: true },
    take: 500,
  });
}
