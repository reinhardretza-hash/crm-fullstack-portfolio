import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { getTotalPages, toSkipTake, type PaginationParams } from "@/lib/pagination";
import type { Prisma } from "@/generated/prisma/client";
import type { EmailContext, EmailFilters } from "@/validations/email";

// Wie Contacts/Leads sind E-Mails intern für jeden aktiven CRM-Benutzer
// lesbar. Authentifizierung gilt auch bei direkter ID- oder Query-Nutzung.
const summarySelect = {
  id: true,
  status: true,
  toEmail: true,
  subject: true,
  createdAt: true,
  sentAt: true,
  sentByUser: { select: { firstName: true, lastName: true } },
} satisfies Prisma.EmailMessageSelect;
export async function getEmailById(id: string) {
  await requireUser();
  return prisma.emailMessage.findUnique({
    where: { id },
    include: {
      sentByUser: { select: { firstName: true, lastName: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      company: { select: { id: true, name: true } },
      lead: { select: { id: true, title: true } },
      deal: { select: { id: true, name: true } },
      invoice: { select: { id: true, invoiceNumber: true } },
      quote: { select: { id: true, quoteNumber: true } },
    },
  });
}
export async function listEmails(filters: EmailFilters, pagination: PaginationParams) {
  await requireUser();
  const where: Prisma.EmailMessageWhereInput = {
    status: filters.status,
    sentByUserId: filters.userId,
    createdAt: { gte: filters.dateFrom, lte: filters.dateTo },
    OR: filters.q
      ? [
          { toEmail: { contains: filters.q, mode: "insensitive" } },
          { subject: { contains: filters.q, mode: "insensitive" } },
          { contact: { firstName: { contains: filters.q, mode: "insensitive" } } },
          { contact: { lastName: { contains: filters.q, mode: "insensitive" } } },
          { company: { name: { contains: filters.q, mode: "insensitive" } } },
        ]
      : undefined,
  };
  const [messages, totalCount] = await Promise.all([
    prisma.emailMessage.findMany({
      where,
      select: summarySelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...toSkipTake(pagination),
    }),
    prisma.emailMessage.count({ where }),
  ]);
  return { messages, totalCount, totalPages: getTotalPages(totalCount, pagination.pageSize) };
}
export async function listContextEmails(context: EmailContext) {
  await requireUser();
  return prisma.emailMessage.findMany({
    where: context,
    select: summarySelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10,
  });
}
export async function listEmailSenders() {
  await requireUser();
  return prisma.user.findMany({
    where: { sentEmails: { some: {} } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { firstName: "asc" },
  });
}
export async function listEmailTemplates() {
  await requireUser();
  return prisma.emailTemplate.findMany({
    where: { isActive: true },
    select: { id: true, name: true, subject: true, body: true },
    orderBy: { name: "asc" },
  });
}
