import type { ActivityType, Prisma } from "@/generated/prisma/client";

type LogActivityInput = {
  type: ActivityType;
  userId?: string;
  companyId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
  taskId?: string;
  calendarEventId?: string;
  invoiceId?: string;
  quoteId?: string;
  metadata?: Prisma.InputJsonValue;
};

// Fachliche, für Benutzer sichtbare CRM-Timeline - bewusst getrennt vom
// AuditLog (Sicherheit/Systemnachvollziehbarkeit). Beide können bei
// derselben Aktion geschrieben werden, siehe die jeweiligen Aufrufer
// (z. B. src/modules/companies/actions.ts).
export async function logActivity(
  tx: Prisma.TransactionClient,
  input: LogActivityInput,
): Promise<void> {
  await tx.activity.create({
    data: {
      type: input.type,
      userId: input.userId,
      companyId: input.companyId,
      contactId: input.contactId,
      leadId: input.leadId,
      dealId: input.dealId,
      taskId: input.taskId,
      calendarEventId: input.calendarEventId,
      invoiceId: input.invoiceId,
      quoteId: input.quoteId,
      metadata: input.metadata,
    },
  });
}
