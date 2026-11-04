import { z } from "zod";

// Werte müssen manuell synchron zu den Enums in prisma/schema.prisma gehalten
// werden (bewusst nicht aus dem generierten Prisma-Client abgeleitet, damit
// Zod-Schema und Datenbankschema unabhängig voneinander lesbar bleiben).
export const COMPANY_SIZE_VALUES = [
  "SOLO",
  "MICRO",
  "SMALL",
  "MEDIUM",
  "LARGE",
  "ENTERPRISE",
] as const;
export const companySizeSchema = z.enum(COMPANY_SIZE_VALUES);

export const COMPANY_STATUS_VALUES = ["PROSPECT", "ACTIVE_CUSTOMER", "INACTIVE", "LOST"] as const;
export const companyStatusSchema = z.enum(COMPANY_STATUS_VALUES);

export const SOURCE_VALUES = [
  "LINKEDIN",
  "WEBSITE",
  "REFERRAL",
  "PHONE",
  "EMAIL",
  "NETWORK",
  "EVENT",
  "EXISTING_CUSTOMER",
  "OTHER",
] as const;
export const sourceSchema = z.enum(SOURCE_VALUES);

export const POTENTIAL_NEED_VALUES = [
  "CUSTOM_SOFTWARE",
  "HANDWERK_OS",
  "WEBSITE",
  "SEO",
  "DIGITALIZATION",
  "PROCESS_OPTIMIZATION",
  "CONSULTING",
  "OTHER",
] as const;
export const potentialNeedSchema = z.enum(POTENTIAL_NEED_VALUES);

export const CONTACT_STATUS_VALUES = ["NEW", "ACTIVE", "CUSTOMER", "INACTIVE", "LOST"] as const;
export const contactStatusSchema = z.enum(CONTACT_STATUS_VALUES);

export const LEAD_STATUS_VALUES = ["OPEN", "WON", "LOST", "ARCHIVED"] as const;
export const leadStatusSchema = z.enum(LEAD_STATUS_VALUES);

export const PRIORITY_VALUES = ["LOW", "NORMAL", "HIGH", "VERY_HIGH"] as const;
export const prioritySchema = z.enum(PRIORITY_VALUES);

export const DEAL_STATUS_VALUES = ["OPEN", "WON", "LOST"] as const;
export const dealStatusSchema = z.enum(DEAL_STATUS_VALUES);

export const TASK_STATUS_VALUES = ["OPEN", "IN_PROGRESS", "COMPLETED"] as const;
export const taskStatusSchema = z.enum(TASK_STATUS_VALUES);

export const USER_ROLE_VALUES = ["OWNER", "ADMIN", "USER"] as const;
export const userRoleSchema = z.enum(USER_ROLE_VALUES);

export const LEAD_SCORE_RULE_NAME_VALUES = [
  "LINKEDIN_SOURCE",
  "DACH_COMPANY",
  "SME_COMPANY",
  "NEED_IDENTIFIED",
] as const;
export const leadScoreRuleNameSchema = z.enum(LEAD_SCORE_RULE_NAME_VALUES);

export const DEAL_LOST_REASON_VALUES = [
  "PRICE",
  "NO_BUDGET",
  "NO_NEED",
  "COMPETITOR",
  "NO_RESPONSE",
  "POSTPONED",
  "OTHER",
] as const;
export const dealLostReasonSchema = z.enum(DEAL_LOST_REASON_VALUES);
