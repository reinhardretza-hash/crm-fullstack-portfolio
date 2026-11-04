import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import type { AuditFilters } from "@/validations/audit";

function baseWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  return {
    userId: filters.userId,
    action: filters.action,
    entityType: filters.entityType,
    createdAt:
      filters.dateFrom !== undefined || filters.dateTo !== undefined
        ? { gte: filters.dateFrom, lte: filters.dateTo }
        : undefined,
  };
}

// Niemals die komplette Tabelle laden (siehe Vorgabe Punkt 24) - immer
// paginiert, mit serverseitigen Filtern statt eines clientseitigen Filters
// auf einer bereits geladenen Vollliste.
export async function listAuditLogs(filters: AuditFilters, pagination: PaginationParams) {
  const where = baseWhere(filters);
  const { skip, take } = toSkipTake(pagination);

  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    logs,
    totalCount,
    totalPages: getTotalPages(totalCount, pagination.pageSize),
  };
}

// Für das Benutzer-Filterfeld - nur Benutzer, die tatsächlich jemals
// einen Audit-Eintrag erzeugt haben, wäre eine Option, aber
// `listAssignableUsers` (alle aktiven Benutzer) ist für dieses Dropdown
// bereits völlig ausreichend und spart eine zusätzliche Query.
export { listAssignableUsers } from "@/modules/users/queries";
