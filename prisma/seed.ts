import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL muss gesetzt sein, um das Seed-Script auszuführen.");
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BCRYPT_SALT_ROUNDS = 12;

// Idempotent: legt den initialen OWNER nur an, wenn noch kein OWNER existiert.
// Läuft dieses Script mehrfach (z. B. bei jedem Deploy), entsteht kein
// zweiter OWNER und bestehende Zugangsdaten werden nicht überschrieben.
async function seedOwner(): Promise<void> {
  const existingOwner = await prisma.user.findFirst({ where: { role: "OWNER" } });

  if (existingOwner) {
    console.log("Ein OWNER-Benutzer existiert bereits. OWNER-Seed wird übersprungen.");
    return;
  }

  const email = process.env.INITIAL_OWNER_EMAIL;
  const password = process.env.INITIAL_OWNER_PASSWORD;
  const firstName = process.env.INITIAL_OWNER_FIRST_NAME;
  const lastName = process.env.INITIAL_OWNER_LAST_NAME;

  if (!email || !password || !firstName || !lastName) {
    throw new Error(
      "INITIAL_OWNER_EMAIL, INITIAL_OWNER_PASSWORD, INITIAL_OWNER_FIRST_NAME und " +
        "INITIAL_OWNER_LAST_NAME müssen gesetzt sein, um den initialen OWNER anzulegen.",
    );
  }

  if (password.length < 12) {
    throw new Error("INITIAL_OWNER_PASSWORD muss mindestens 12 Zeichen lang sein.");
  }

  const passwordHash = await hash(password, BCRYPT_SALT_ROUNDS);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role: "OWNER",
    },
  });

  // Absichtlich keine Zugangsdaten loggen – nur die Bestätigung, ohne Passwort.
  console.log("OWNER-Benutzer wurde angelegt.");
}

// Reihenfolge entspricht exakt der Vorgabe (10 Stufen). isWonStage/
// isLostStage sind die einzige Quelle der Wahrheit für Gewonnen/Verloren -
// nirgendwo im Code wird der Name einer Stufe ausgewertet.
const DEFAULT_STAGES = [
  { name: "Neuer Kontakt" },
  { name: "Vernetzt" },
  { name: "Kontakt aufgenommen" },
  { name: "Gespräch läuft" },
  { name: "Bedarf erkannt" },
  { name: "Termin vereinbart" },
  { name: "Angebot" },
  { name: "Verhandlung" },
  { name: "Gewonnen", isWonStage: true },
  { name: "Verloren", isLostStage: true },
] as const;

// Idempotent: legt die Standardpipeline inkl. Stufen nur an, wenn noch keine
// Standardpipeline existiert. Beschädigt den OWNER-Seed nicht (eigene,
// unabhängige Funktion).
async function seedDefaultPipeline(): Promise<void> {
  const existingDefault = await prisma.pipeline.findFirst({ where: { isDefault: true } });

  if (existingDefault) {
    console.log("Eine Standardpipeline existiert bereits. Pipeline-Seed wird übersprungen.");
    return;
  }

  await prisma.pipeline.create({
    data: {
      name: "Standardpipeline",
      isDefault: true,
      isActive: true,
      stages: {
        create: DEFAULT_STAGES.map((stage, index) => ({
          name: stage.name,
          position: index + 1,
          isWonStage: "isWonStage" in stage ? stage.isWonStage : false,
          isLostStage: "isLostStage" in stage ? stage.isLostStage : false,
        })),
      },
    },
  });

  console.log("Standardpipeline mit 10 Stufen wurde angelegt.");
}

// Dieselben Standard-Punktwerte wie DEFAULT_LEAD_SCORE_RULE_POINTS in
// src/modules/leads/score.ts - bewusst hier noch einmal hartcodiert statt
// importiert, da dieses Skript außerhalb des Next.js-Laufzeitkontexts läuft
// (eigener PrismaClient, kein `@/lib/env`) und bereits bei OWNER/Pipeline
// genauso verfährt (keine Imports aus src/modules). Ändert sich ein
// Standardwert, muss er an beiden Stellen angepasst werden - für die
// vier festen Regeln vertretbar.
const DEFAULT_LEAD_SCORE_RULES = [
  { rule: "LINKEDIN_SOURCE", points: 10 },
  { rule: "DACH_COMPANY", points: 10 },
  { rule: "SME_COMPANY", points: 10 },
  { rule: "NEED_IDENTIFIED", points: 30 },
] as const;

// Idempotent über upsert: legt fehlende Regeln an, ändert aber NICHT die
// Punktwerte bereits existierender Regeln (ein Admin könnte sie über
// /settings/lead-scoring bereits angepasst haben - ein erneuter Seed-Lauf
// darf das nicht überschreiben).
async function seedLeadScoreRules(): Promise<void> {
  for (const { rule, points } of DEFAULT_LEAD_SCORE_RULES) {
    await prisma.leadScoreRule.upsert({
      where: { rule },
      update: {},
      create: { rule, points, enabled: true },
    });
  }
  console.log("Lead-Scoring-Regeln sind vorhanden (Standardwerte für fehlende Regeln angelegt).");
}

// Singleton: legt die Einstellungen-Zeile nur an, wenn noch keine existiert.
async function seedSystemSettings(): Promise<void> {
  const existing = await prisma.systemSettings.findFirst();
  if (existing) {
    console.log("SystemSettings existieren bereits. Settings-Seed wird übersprungen.");
    return;
  }

  await prisma.systemSettings.create({
    data: { companyName: "RDEvolution GbR", timezone: "Europe/Berlin", currency: "EUR" },
  });
  console.log("SystemSettings mit Standardwerten wurden angelegt.");
}

async function main() {
  await seedOwner();
  await seedDefaultPipeline();
  await seedLeadScoreRules();
  await seedSystemSettings();
  for (const template of [
    {
      id: "crm-email-introduction",
      name: "Kontaktaufnahme",
      subject: "Kontaktaufnahme",
      body: "Guten Tag,\n\nich möchte mich kurz bei Ihnen vorstellen.\n\nMit freundlichen Grüßen",
    },
    {
      id: "crm-email-follow-up",
      name: "Nach unserem Gespräch",
      subject: "Nach unserem Gespräch",
      body: "Guten Tag,\n\nvielen Dank für unser Gespräch. Hier finden Sie die besprochenen Informationen.\n\nMit freundlichen Grüßen",
    },
  ])
    await prisma.emailTemplate.upsert({ where: { id: template.id }, update: {}, create: template });
}

main()
  .catch(() => {
    console.error("Seed fehlgeschlagen. Datenbankzugriff und INITIAL_OWNER_* prüfen; keine Zugangsdaten ausgeben.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
