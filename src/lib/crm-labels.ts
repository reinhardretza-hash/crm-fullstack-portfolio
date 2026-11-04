import type {
  CompanySize,
  CompanyStatus,
  ContactStatus,
  DealLostReason,
  DealStatus,
  LeadScoreRuleName,
  LeadStatus,
  PotentialNeed,
  Priority,
  Source,
  TaskStatus,
} from "@/generated/prisma/client";

// Rein kosmetische deutsche Beschriftungen - intern werden ausschließlich die
// stabilen Enum-Werte gespeichert/verglichen/gefiltert.
export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  SOLO: "Solo",
  MICRO: "Kleinstunternehmen",
  SMALL: "Kleinunternehmen",
  MEDIUM: "Mittelstand",
  LARGE: "Großunternehmen",
  ENTERPRISE: "Enterprise",
};

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  PROSPECT: "Interessent",
  ACTIVE_CUSTOMER: "Aktiver Kunde",
  INACTIVE: "Inaktiv",
  LOST: "Verloren",
};

export const SOURCE_LABELS: Record<Source, string> = {
  LINKEDIN: "LinkedIn",
  WEBSITE: "Website",
  REFERRAL: "Empfehlung",
  PHONE: "Telefon",
  EMAIL: "E-Mail",
  NETWORK: "Netzwerk",
  EVENT: "Messe",
  EXISTING_CUSTOMER: "Bestehender Kunde",
  OTHER: "Sonstiges",
};

export const POTENTIAL_NEED_LABELS: Record<PotentialNeed, string> = {
  CUSTOM_SOFTWARE: "Individuelle Software",
  HANDWERK_OS: "Handwerk OS",
  WEBSITE: "Website",
  SEO: "SEO",
  DIGITALIZATION: "Digitalisierung",
  PROCESS_OPTIMIZATION: "Prozessoptimierung",
  CONSULTING: "Beratung",
  OTHER: "Sonstiges",
};

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  NEW: "Neu",
  ACTIVE: "Aktiv",
  CUSTOMER: "Kunde",
  INACTIVE: "Inaktiv",
  LOST: "Verloren",
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  OPEN: "Offen",
  WON: "Gewonnen",
  LOST: "Verloren",
  ARCHIVED: "Archiviert",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Niedrig",
  NORMAL: "Normal",
  HIGH: "Hoch",
  VERY_HIGH: "Sehr hoch",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  OPEN: "Offen",
  WON: "Gewonnen",
  LOST: "Verloren",
};

export const LEAD_SCORE_RULE_LABELS: Record<LeadScoreRuleName, string> = {
  LINKEDIN_SOURCE: "Kontakt über LinkedIn",
  DACH_COMPANY: "Unternehmen im DACH-Raum",
  SME_COMPANY: "Kleines/mittleres Unternehmen (KMU)",
  NEED_IDENTIFIED: "Bedarf erkannt",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  COMPLETED: "Erledigt",
};

export const DEAL_LOST_REASON_LABELS: Record<DealLostReason, string> = {
  PRICE: "Preis",
  NO_BUDGET: "Kein Budget",
  NO_NEED: "Kein Bedarf",
  COMPETITOR: "Wettbewerber",
  NO_RESPONSE: "Keine Rückmeldung",
  POSTPONED: "Verschoben",
  OTHER: "Sonstiges",
};
