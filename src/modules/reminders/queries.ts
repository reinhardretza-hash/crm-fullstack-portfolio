import type { Prisma, User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { calendarDaysSince } from "./rules";

const DASHBOARD_LIMIT = 15;

// "Benötigt Aufmerksamkeit": offene Reminder; USER sieht nur eigene,
// OWNER/ADMIN alle (inkl. "Kein (aktiver) Verantwortlicher"). Gelöschte
// Zielobjekte werden ausgeblendet.
export async function listAttentionReminders(
  user: Pick<User, "id" | "role">,
  options: { scope?: Prisma.ReminderWhereInput; limit?: number } = {},
) {
  const where: Prisma.ReminderWhereInput = {
    status: { not: "RESOLVED" },
    AND: [
      ...(options.scope ? [options.scope] : []),
      { OR: [{ quoteId: null }, { quote: { deletedAt: null } }] },
      { OR: [{ dealId: null }, { deal: { deletedAt: null } }] },
      { OR: [{ leadId: null }, { lead: { deletedAt: null } }] },
      { OR: [{ taskId: null }, { task: { deletedAt: null } }] },
      { OR: [{ invoiceId: null }, { invoice: { deletedAt: null } }] },
    ],
    ...(user.role === "USER" ? { assignedUserId: user.id } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.reminder.findMany({
      where,
      orderBy: { triggeredAt: "desc" },
      take: options.limit ?? DASHBOARD_LIMIT,
      select: {
        id: true,
        type: true,
        status: true,
        triggeredAt: true,
        assignedUser: { select: { firstName: true, lastName: true } },
        quote: { select: { id: true, quoteNumber: true, sentAt: true, updatedAt: true } },
        deal: { select: { id: true, name: true } },
        lead: { select: { id: true, title: true } },
        task: { select: { id: true, title: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
    }),
    prisma.reminder.count({ where }),
  ]);
  const now = new Date();
  return {
    total,
    items: rows.map((row) => {
      const target = row.quote
        ? { label: row.quote.quoteNumber, href: `/quotes/${row.quote.id}` }
        : row.deal
          ? { label: row.deal.name, href: `/deals/${row.deal.id}` }
          : row.lead
            ? { label: row.lead.title, href: `/leads/${row.lead.id}` }
            : row.task
              ? { label: row.task.title, href: `/tasks/${row.task.id}` }
              : row.invoice
                ? { label: row.invoice.invoiceNumber, href: `/invoices/${row.invoice.id}` }
                : null;
      return {
        id: row.id,
        type: row.type,
        status: row.status,
        target,
        assigneeName: row.assignedUser
          ? `${row.assignedUser.firstName} ${row.assignedUser.lastName}`
          : null,
        daysOpen: calendarDaysSince(row.triggeredAt, now),
      };
    }),
  };
}

// Reminder einer Kundenakte: Reminder, deren Zielobjekt (Angebot, Deal, Lead,
// Aufgabe, Rechnung) zu diesem Unternehmen/Kontakt/Deal gehört.
export function reminderScopeWhere(scope: {
  kind: "company" | "contact" | "deal";
  id: string;
  leadId?: string | null;
}): Prisma.ReminderWhereInput {
  const { id } = scope;
  if (scope.kind === "deal") {
    return {
      OR: [
        { dealId: id },
        { quote: { dealId: id } },
        { invoice: { dealId: id } },
        { task: { dealId: id } },
        ...(scope.leadId ? [{ leadId: scope.leadId }] : []),
      ],
    };
  }
  const field = scope.kind === "company" ? "companyId" : "contactId";
  return {
    OR: [
      { deal: { [field]: id } },
      { quote: { [field]: id } },
      { invoice: { [field]: id } },
      { task: { [field]: id } },
      { lead: { [field]: id } },
    ],
  };
}
