// Eine Kundenakte gehört zu genau einem Unternehmen, Kontakt oder Deal.
export type FileScope =
  { kind: "company"; id: string } | { kind: "contact"; id: string } | { kind: "deal"; id: string };

export function scopeIdField(scope: FileScope): "companyId" | "contactId" | "dealId" {
  return scope.kind === "company" ? "companyId" : scope.kind === "contact" ? "contactId" : "dealId";
}

// { companyId } | { contactId } | { dealId } - passt auf Task, CalendarEvent,
// Note, FileAttachment, Quote und Invoice (jeweils echte FKs).
export function scopeWhere(scope: FileScope): Record<string, string> {
  return { [scopeIdField(scope)]: scope.id };
}

// Query-String für bestehende Create-Flows (/tasks/new, /calendar/new, /emails/new).
export function scopeQuery(
  scope: FileScope,
  extra: Record<string, string | null | undefined> = {},
) {
  const params = new URLSearchParams({ [scopeIdField(scope)]: scope.id });
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

export const TAB_KEYS = ["overview", "history", "sales", "tasks", "files"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export function parseTab(raw: string | string[] | undefined, allowed: readonly TabKey[]): TabKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return allowed.find((tab) => tab === value) ?? "overview";
}
