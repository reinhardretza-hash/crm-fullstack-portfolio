import type { Prisma } from "@/generated/prisma/client";

export type CrmAuditAction =
  | "INVOICE_CREATED"
  | "INVOICE_UPDATED"
  | "INVOICE_STATUS_CHANGED"
  | "INVOICE_DELETED"
  | "QUOTE_CREATED"
  | "QUOTE_UPDATED"
  | "QUOTE_STATUS_CHANGED"
  | "QUOTE_DELETED"
  | "CALENDAR_EVENT_CREATED"
  | "CALENDAR_EVENT_UPDATED"
  | "CALENDAR_EVENT_RESCHEDULED"
  | "CALENDAR_EVENT_COMPLETED"
  | "CALENDAR_EVENT_CANCELLED"
  | "CALENDAR_EVENT_REOPENED"
  | "CALENDAR_EVENT_DELETED"
  | "EMAIL_SENT"
  | "EMAIL_FAILED"
  | "COMPANY_CREATED"
  | "COMPANY_UPDATED"
  | "COMPANY_DELETED"
  | "CONTACT_CREATED"
  | "CONTACT_UPDATED"
  | "CONTACT_DELETED"
  | "NOTE_CREATED"
  | "LEAD_CREATED"
  | "LEAD_UPDATED"
  | "LEAD_DELETED"
  | "LEAD_STAGE_CHANGED"
  | "LEAD_WON"
  | "LEAD_LOST"
  | "DEAL_CREATED"
  | "DEAL_UPDATED"
  | "DEAL_DELETED"
  | "DEAL_WON"
  | "DEAL_LOST"
  | "DEAL_REOPENED"
  | "TASK_CREATED"
  | "TASK_UPDATED"
  | "TASK_COMPLETED"
  | "TASK_REOPENED"
  | "TASK_DELETED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "USER_ROLE_CHANGED"
  | "USER_ACTIVATED"
  | "USER_DEACTIVATED"
  | "USER_PASSWORD_RESET"
  | "USER_PASSWORD_CHANGED"
  | "PIPELINE_UPDATED"
  | "PIPELINE_STAGE_UPDATED"
  | "PIPELINE_STAGE_REORDERED"
  | "PIPELINE_STAGE_DELETED"
  | "TAG_CREATED"
  | "TAG_UPDATED"
  | "TAG_DELETED"
  | "SETTINGS_UPDATED"
  | "REMINDER_SETTINGS_UPDATED"
  | "FILE_UPLOADED"
  | "FILE_DELETED"
  | "CALL_LOGGED"
  | "LEAD_SCORING_UPDATED";

type WriteCrmAuditLogInput = {
  action: CrmAuditAction;
  userId: string;
  entityType:
    | "Invoice"
    | "Quote"
    | "CalendarEvent"
    | "EmailMessage"
    | "Company"
    | "Contact"
    | "Note"
    | "Lead"
    | "Deal"
    | "Task"
    | "User"
    | "Pipeline"
    | "PipelineStage"
    | "Tag"
    | "SystemSettings"
    | "ReminderSettings"
    | "FileAttachment"
    | "LeadScoreRule";
  entityId: string;
  metadata?: Prisma.InputJsonValue;
};

// Sicherheits-/Systemnachvollziehbarkeit (AuditLog) - getrennt von der
// fachlichen CRM-Timeline (Activity, siehe src/modules/activity/log.ts).
// Beide werden für dieselbe Aktion geschrieben, dienen aber unterschiedlichen
// Zwecken: AuditLog ist für Admin-Nachvollziehbarkeit, Activity für die
// Detailseiten-Timeline der Benutzer.
export async function writeCrmAuditLog(
  tx: Prisma.TransactionClient,
  input: WriteCrmAuditLogInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "USER",
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}
