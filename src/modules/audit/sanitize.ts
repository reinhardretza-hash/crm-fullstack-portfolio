// Ausschließlich bekannte fachliche Felder, keine generischen JSON-Dumps.
const ALLOWED_KEYS = new Set([
  "invoiceId",
  "quoteId",
  "calendarEventId",
  "taskId",
  "version",
  "emailMessageId",
  "contactId",
  "companyId",
  "leadId",
  "dealId",
  "status",
  "role",
  "fromRole",
  "toRole",
  "isActive",
  "softDeleted",
  "fromPosition",
  "toPosition",
  "fromName",
  "toName",
  "name",
  "mergedFromTagId",
  "mergedFromName",
  "fromUserId",
  "toUserId",
  "fromStageId",
  "toStageId",
  "lostReason",
  "fromNextFollowUpAt",
  "toNextFollowUpAt",
]);

export function sanitizeAuditMetadata(metadata: unknown): Record<string, string> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) {
      continue;
    }
    if (value === null || value === undefined) {
      result[key] = "–";
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (
        typeof value === "string" &&
        (/\$2[aby]\$\d{2}\$/.test(value) || /eyJ[\w-]*\.[\w-]+\.[\w-]+/.test(value))
      )
        continue;
      result[key] = String(value);
    }
    // Objekte/Arrays bewusst übersprungen - keine generischen JSON-Dumps im UI.
  }

  return Object.keys(result).length > 0 ? result : null;
}
