import type { ActivityType } from "@/generated/prisma/client";
import { DEAL_LOST_REASON_LABELS } from "@/lib/crm-labels";

// EINZIGE Stelle für Activity-Label, -Kategorie, -Ziel und -Beschreibung.
// Timeline, Dashboard und /activities nutzen alle diese Datei - keine
// verteilte Mapping-Logik. Bewusst ohne Prisma-Import (rein, unit-testbar).
export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  INVOICE_CREATED: "Rechnung erstellt",
  INVOICE_UPDATED: "Rechnung bearbeitet",
  INVOICE_READY: "Rechnung bereit",
  INVOICE_SENT: "Rechnung gesendet",
  INVOICE_PAID: "Rechnung bezahlt",
  INVOICE_CANCELLED: "Rechnung intern storniert",
  INVOICE_REOPENED: "Rechnung wieder geöffnet",
  INVOICE_DELETED: "Rechnung gelöscht",
  QUOTE_CREATED: "Angebot erstellt",
  QUOTE_UPDATED: "Angebot bearbeitet",
  QUOTE_READY: "Angebot bereit",
  QUOTE_SENT: "Angebot gesendet",
  QUOTE_ACCEPTED: "Angebot angenommen",
  QUOTE_REJECTED: "Angebot abgelehnt",
  QUOTE_CANCELLED: "Angebot storniert",
  QUOTE_EXPIRED: "Angebot abgelaufen",
  QUOTE_REOPENED: "Angebot wieder geöffnet",
  QUOTE_DELETED: "Angebot gelöscht",
  CALENDAR_EVENT_CREATED: "Termin geplant",
  CALENDAR_EVENT_UPDATED: "Termin bearbeitet",
  CALENDAR_EVENT_RESCHEDULED: "Termin verschoben",
  CALENDAR_EVENT_COMPLETED: "Termin abgeschlossen",
  CALENDAR_EVENT_CANCELLED: "Termin abgesagt",
  CALENDAR_EVENT_REOPENED: "Termin wieder geöffnet",
  CALENDAR_EVENT_DELETED: "Termin gelöscht",
  EMAIL_SENT: "E-Mail gesendet",
  EMAIL_FAILED: "E-Mail fehlgeschlagen",
  CALL_LOGGED: "Anruf dokumentiert",
  COMPANY_CREATED: "Unternehmen erstellt",
  COMPANY_UPDATED: "Unternehmen bearbeitet",
  CONTACT_CREATED: "Kontakt erstellt",
  CONTACT_UPDATED: "Kontakt bearbeitet",
  NOTE_ADDED: "Notiz hinzugefügt",
  LEAD_CREATED: "Lead erstellt",
  LEAD_UPDATED: "Lead bearbeitet",
  LEAD_STAGE_CHANGED: "Pipeline-Stufe geändert",
  LEAD_WON: "Lead gewonnen",
  LEAD_LOST: "Lead verloren",
  LEAD_FOLLOW_UP_CHANGED: "Follow-up geändert",
  DEAL_CREATED: "Deal erstellt",
  DEAL_UPDATED: "Deal bearbeitet",
  DEAL_WON: "Deal gewonnen",
  DEAL_LOST: "Deal verloren",
  DEAL_REOPENED: "Deal wiedereröffnet",
  TASK_CREATED: "Aufgabe erstellt",
  TASK_UPDATED: "Aufgabe bearbeitet",
  TASK_COMPLETED: "Aufgabe erledigt",
  TASK_REOPENED: "Aufgabe wieder geöffnet",
  TASK_REASSIGNED: "Aufgabe neu zugewiesen",
};

export const ACTIVITY_CATEGORIES = [
  "SALES",
  "COMMUNICATION",
  "TASKS",
  "CALENDAR",
  "QUOTES",
  "INVOICES",
  "MASTER_DATA",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  SALES: "Vertrieb",
  COMMUNICATION: "Kommunikation",
  TASKS: "Aufgaben",
  CALENDAR: "Kalender",
  QUOTES: "Angebote",
  INVOICES: "Rechnungen",
  MASTER_DATA: "Stammdaten",
};

// Kategorie rein aus dem bestehenden ActivityType abgeleitet (Präfix) - keine
// neue Datenbankstruktur. Als Record<ActivityType, ...> typisiert, damit ein
// neuer ActivityType ohne Kategorie nicht kompiliert.
function categoryOf(type: ActivityType): ActivityCategory {
  if (type.startsWith("INVOICE_")) return "INVOICES";
  if (type.startsWith("QUOTE_")) return "QUOTES";
  if (type.startsWith("CALENDAR_EVENT_")) return "CALENDAR";
  if (type.startsWith("EMAIL_") || type.startsWith("CALL_") || type === "NOTE_ADDED")
    return "COMMUNICATION";
  if (type.startsWith("TASK_")) return "TASKS";
  if (type.startsWith("LEAD_") || type.startsWith("DEAL_")) return "SALES";
  return "MASTER_DATA";
}

export const ACTIVITY_TYPES = Object.keys(ACTIVITY_LABELS) as ActivityType[];

export const ACTIVITY_CATEGORY_BY_TYPE = Object.fromEntries(
  ACTIVITY_TYPES.map((type) => [type, categoryOf(type)]),
) as Record<ActivityType, ActivityCategory>;

export function activityTypesInCategory(category: ActivityCategory): ActivityType[] {
  return ACTIVITY_TYPES.filter((type) => ACTIVITY_CATEGORY_BY_TYPE[type] === category);
}

export function isActivityType(value: string): value is ActivityType {
  return Object.hasOwn(ACTIVITY_LABELS, value);
}

// Freitext -> passende Typen über das Label (z. B. "gewonnen").
export function activityTypesMatchingText(text: string): ActivityType[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];
  return ACTIVITY_TYPES.filter((type) => ACTIVITY_LABELS[type].toLowerCase().includes(needle));
}

// --- Metadaten: ausschließlich Whitelist, keine Rohdaten/Secrets/E-Mail-Adressen.
const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});
const DAY_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
});

export type SafeActivityMetadata = {
  invoiceNumber?: string;
  quoteNumber?: string;
  title?: string;
  startsAt?: Date;
  subject?: string;
  fromStageName?: string;
  toStageName?: string;
  oldFollowUpAt?: Date | null;
  newFollowUpAt?: Date | null;
  lostReason?: keyof typeof DEAL_LOST_REASON_LABELS;
  emailMessageId?: string;
  callOutcome?: CallOutcome;
  durationMinutes?: number;
  callNote?: string;
  nextStep?: string;
};

export const CALL_OUTCOMES = ["REACHED", "NOT_REACHED", "CALLBACK", "VOICEMAIL"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  REACHED: "Erreicht",
  NOT_REACHED: "Nicht erreicht",
  CALLBACK: "Rückruf vereinbart",
  VOICEMAIL: "Mailbox besprochen",
};

const MAX_TEXT = 200;
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_TEXT) : undefined;
const date = (value: unknown): Date | undefined => {
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

export function safeActivityMetadata(metadata: unknown): SafeActivityMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const raw = metadata as Record<string, unknown>;
  const result: SafeActivityMetadata = {
    invoiceNumber: text(raw.invoiceNumber),
    quoteNumber: text(raw.quoteNumber),
    title: text(raw.title),
    startsAt: date(raw.startsAt),
    subject: text(raw.subject),
    fromStageName: text(raw.fromStageName),
    toStageName: text(raw.toStageName),
    emailMessageId: text(raw.emailMessageId),
    callNote: text(raw.callNote),
    nextStep: text(raw.nextStep),
  };
  if (
    typeof raw.callOutcome === "string" &&
    (CALL_OUTCOMES as readonly string[]).includes(raw.callOutcome)
  ) {
    result.callOutcome = raw.callOutcome as CallOutcome;
  }
  if (
    typeof raw.durationMinutes === "number" &&
    Number.isInteger(raw.durationMinutes) &&
    raw.durationMinutes >= 1 &&
    raw.durationMinutes <= 600
  ) {
    result.durationMinutes = raw.durationMinutes;
  }
  if ("oldFollowUpAt" in raw) result.oldFollowUpAt = date(raw.oldFollowUpAt) ?? null;
  if ("newFollowUpAt" in raw) result.newFollowUpAt = date(raw.newFollowUpAt) ?? null;
  if (
    typeof raw.lostReason === "string" &&
    Object.hasOwn(DEAL_LOST_REASON_LABELS, raw.lostReason)
  ) {
    result.lostReason = raw.lostReason as keyof typeof DEAL_LOST_REASON_LABELS;
  }
  return result;
}

// Verständliche Zusatzzeile zur Aktivität (oder null).
export function describeActivityDetail(type: ActivityType, metadata: unknown): string | null {
  const m = safeActivityMetadata(metadata);
  switch (ACTIVITY_CATEGORY_BY_TYPE[type]) {
    case "INVOICES":
      return m.invoiceNumber ?? null;
    case "QUOTES":
      return m.quoteNumber ?? null;
    case "CALENDAR":
      return (
        [m.title, m.startsAt ? DATE_FORMATTER.format(m.startsAt) : undefined]
          .filter(Boolean)
          .join(" · ") || null
      );
    case "COMMUNICATION":
      if (type === "CALL_LOGGED") {
        return (
          [
            m.callOutcome ? CALL_OUTCOME_LABELS[m.callOutcome] : undefined,
            m.durationMinutes ? `${m.durationMinutes} Min.` : undefined,
            m.callNote,
            m.nextStep ? `Nächster Schritt: ${m.nextStep}` : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || null
        );
      }
      return type === "NOTE_ADDED" ? null : (m.subject ?? null);
    default:
  }
  if (type === "LEAD_STAGE_CHANGED" && m.fromStageName && m.toStageName) {
    return `"${m.fromStageName}" → "${m.toStageName}"`;
  }
  if (
    type === "LEAD_FOLLOW_UP_CHANGED" &&
    (m.oldFollowUpAt !== undefined || m.newFollowUpAt !== undefined)
  ) {
    const fmt = (d: Date | null | undefined) => (d ? DAY_FORMATTER.format(d) : "–");
    return `${fmt(m.oldFollowUpAt)} → ${fmt(m.newFollowUpAt)}`;
  }
  if (type === "DEAL_LOST" && m.lostReason)
    return `Grund: ${DEAL_LOST_REASON_LABELS[m.lostReason]}`;
  return null;
}

// --- Ziel / Deep Link.
export type ActivityTargetKind =
  | "invoice"
  | "quote"
  | "calendarEvent"
  | "task"
  | "deal"
  | "lead"
  | "contact"
  | "company"
  | "email";

export type ActivityTarget = {
  kind: ActivityTargetKind;
  label: string;
  href: string | null;
  deleted: boolean;
};

type Linked = { id: string; deletedAt: Date | null };
export type ActivityTargetSource = {
  type: ActivityType;
  metadata: unknown;
  company: (Linked & { name: string }) | null;
  contact: (Linked & { firstName: string | null; lastName: string | null }) | null;
  lead: (Linked & { title: string }) | null;
  deal: (Linked & { name: string }) | null;
  task: (Linked & { title: string }) | null;
  calendarEvent: (Linked & { title: string }) | null;
  quote: (Linked & { quoteNumber: string }) | null;
  invoice: (Linked & { invoiceNumber: string }) | null;
};

const PRIMARY_PREFIX: [string, ActivityTargetKind][] = [
  ["INVOICE_", "invoice"],
  ["QUOTE_", "quote"],
  ["CALENDAR_EVENT_", "calendarEvent"],
  ["TASK_", "task"],
  ["DEAL_", "deal"],
  ["LEAD_", "lead"],
  ["CONTACT_", "contact"],
  ["COMPANY_", "company"],
  ["EMAIL_", "email"],
];
const FALLBACK_ORDER: ActivityTargetKind[] = ["deal", "lead", "contact", "company"];

export function contactLabel(contact: { firstName: string | null; lastName: string | null }) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(Ohne Namen)";
}

function buildTarget(
  kind: ActivityTargetKind,
  source: ActivityTargetSource,
  options: { canViewEmails: boolean },
): ActivityTarget | null {
  const make = (linked: Linked | null, label: string | null, base: string, k = kind) =>
    linked && label !== null
      ? {
          kind: k,
          label,
          // Gelöschtes Ziel: Verlauf bleibt lesbar, aber kein kaputter Link.
          href: linked.deletedAt ? null : `${base}/${linked.id}`,
          deleted: Boolean(linked.deletedAt),
        }
      : null;
  switch (kind) {
    case "invoice":
      return make(source.invoice, source.invoice?.invoiceNumber ?? null, "/invoices");
    case "quote":
      return make(source.quote, source.quote?.quoteNumber ?? null, "/quotes");
    case "calendarEvent":
      return make(source.calendarEvent, source.calendarEvent?.title ?? null, "/calendar");
    case "task":
      return make(source.task, source.task?.title ?? null, "/tasks");
    case "deal":
      return make(source.deal, source.deal?.name ?? null, "/deals");
    case "lead":
      return make(source.lead, source.lead?.title ?? null, "/leads");
    case "contact":
      return make(
        source.contact,
        source.contact ? contactLabel(source.contact) : null,
        "/contacts",
      );
    case "company":
      return make(source.company, source.company?.name ?? null, "/companies");
    case "email": {
      const m = safeActivityMetadata(source.metadata);
      if (!m.emailMessageId) return null;
      return {
        kind,
        label: m.subject ?? "E-Mail",
        href: options.canViewEmails ? `/emails/${m.emailMessageId}` : null,
        deleted: false,
      };
    }
  }
}

export function activityTarget(
  source: ActivityTargetSource,
  options: { canViewEmails: boolean },
): ActivityTarget | null {
  const primary = PRIMARY_PREFIX.find(([prefix]) => source.type.startsWith(prefix))?.[1];
  const order = [...(primary ? [primary] : []), ...FALLBACK_ORDER];
  for (const kind of order) {
    const target = buildTarget(kind, source, options);
    if (target) return target;
  }
  return null;
}
