import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import type { Prisma } from "@/generated/prisma/client";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { toSkipTake, getTotalPages, type PaginationParams } from "@/lib/pagination";
import type { InvoiceFilters } from "@/validations/invoice";
export const INVOICE_INCLUDE = {
  quote: { select: { id: true, quoteNumber: true } },
  company: true,
  contact: true,
  deal: true,
  assignedUser: { select: { id: true, firstName: true, lastName: true } },
  items: { orderBy: { position: "asc" as const } },
} satisfies Prisma.InvoiceInclude;
export function invoiceWhere(filters: InvoiceFilters, now = new Date()): Prisma.InvoiceWhereInput {
  const today = new Date(dateKeyInTimeZone(now));
  const overdue = {
    OR: [{ status: "OVERDUE" as const }, { status: "SENT" as const, dueDate: { lt: today } }],
  };
  const status: Prisma.InvoiceWhereInput =
    filters.status === "OVERDUE"
      ? overdue
      : filters.status === "SENT"
        ? { status: "SENT", dueDate: { gte: today } }
        : { status: filters.status };
  return {
    deletedAt: null,
    companyId: filters.companyId,
    assignedUserId: filters.userId,
    AND: [
      status,
      ...(filters.overdue ? [filters.overdue === "yes" ? overdue : { NOT: overdue }] : []),
    ],
    dueDate: {
      gte: filters.dueFrom ? new Date(filters.dueFrom) : undefined,
      lte: filters.dueTo ? new Date(filters.dueTo) : undefined,
    },
    issueDate: {
      gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
      lte: filters.dateTo ? new Date(filters.dateTo) : undefined,
    },
    OR: filters.q
      ? [
          { invoiceNumber: { contains: filters.q, mode: "insensitive" } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
          { quote: { quoteNumber: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
}
export async function listInvoices(filters: InvoiceFilters, pagination: PaginationParams) {
  await requireUser();
  const where = invoiceWhere(filters);
  const sort = {
    updated: "updatedAt",
    number: "invoiceNumber",
    total: "totalCents",
    dueDate: "dueDate",
  }[filters.sort];
  const [invoices, totalCount] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: INVOICE_INCLUDE,
      orderBy: [{ [sort]: filters.direction }, { id: "asc" }],
      ...toSkipTake(pagination),
    }),
    prisma.invoice.count({ where }),
  ]);
  return { invoices, totalCount, totalPages: getTotalPages(totalCount, pagination.pageSize) };
}
export async function getInvoice(id: string) {
  await requireUser();
  return prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      ...INVOICE_INCLUDE,
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      emails: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}
export { quoteFormOptions as invoiceFormOptions } from "@/modules/quotes/queries";
