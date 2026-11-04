import { afterAll, beforeEach } from "vitest";

// Eigene Testdatenbank, NIEMALS die lokale Entwicklungs- oder gar eine
// Produktionsdatenbank. TEST_DATABASE_URL (oder eine explizite DATABASE_URL
// mit geprüftem Testdatenbanknamen) muss vom Aufrufer gesetzt werden.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!process.env.DATABASE_URL)
  throw new Error("TEST_DATABASE_URL für eine separate Testdatenbank setzen.");
const testDatabase = new URL(process.env.DATABASE_URL);
if (
  !/^postgres(ql)?:$/.test(testDatabase.protocol) ||
  !/_test(?:_|$)/.test(decodeURIComponent(testDatabase.pathname))
) {
  throw new Error(
    "Integrationstests verweigert: Datenbankname muss _test enthalten (am Ende oder vor _). Keine Dev-/Produktionsdatenbank verwenden.",
  );
}
process.env.AUTH_SECRET ??= "integration-test-auth-secret-at-least-32-chars";
process.env.LOGIN_RATE_LIMIT_SECRET ??= "integration-test-rate-limit-secret-32-chars";

const { prisma } = await import("@/lib/prisma");
const { ensureDefaultLeadScoreRules } = await import("@/modules/leads/score-rules");
const { ensureSystemSettings } = await import("@/modules/settings/queries");

// Sauber definierter Datenzustand vor JEDEM Test - keine Tests, die von der
// Ausführungsreihenfolge oder von Daten aus einem vorherigen Test abhängen.
// TRUNCATE ... CASCADE räumt auch alle Join-Tabellen mit auf; RESTART
// IDENTITY ist hier irrelevant (wir verwenden cuid-Strings, keine Sequenzen),
// schadet aber nicht.
//
// "lead_score_rules" und "system_settings" sind Konfigurations-/
// Referenzdaten (Singleton bzw. eine feste Regelliste), aber GENAU WEIL
// Phase-6-Tests (Lead-Scoring-/Settings-Administration) sie gezielt
// verändern, müssen sie trotzdem vor JEDEM Test zurückgesetzt werden -
// sonst bleibt z. B. ein in einem Test gesetzter Punktwert über
// Testdatei-Grenzen hinweg bestehen und verfälscht andere Tests (so
// tatsächlich einmal beobachtet: ein Lead-Scoring-Test hatte
// LINKEDIN_SOURCE auf 999 gesetzt, wodurch ein völlig anderer
// Lead-Erstellung-Test in einer anderen Datei einen falschen Score sah).
// Nach dem TRUNCATE werden beide Tabellen sofort wieder mit ihren
// Standardwerten befüllt (dieselbe Idempotenz-Logik wie beim Seed-Skript).
const TABLES = [
  "invoice_items",
  "invoices",
  "invoice_number_sequences",
  "quote_items",
  "quotes",
  "quote_number_sequences",
  "calendar_events",
  "email_messages",
  "email_templates",
  "activities",
  "notes",
  "tasks",
  "deals",
  "company_tags",
  "contact_tags",
  "company_needs",
  "tags",
  "leads",
  "pipeline_stages",
  "pipelines",
  "contacts",
  "companies",
  "audit_logs",
  "login_identifier_rate_limits",
  "login_origin_rate_limits",
  "users",
  "lead_score_rules",
  "system_settings",
  "reminder_settings",
  "file_attachments",
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE;`);
  await ensureDefaultLeadScoreRules(prisma);
  await ensureSystemSettings(prisma);
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
