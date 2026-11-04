import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_SETTINGS = {
  companyName: "RDEvolution GbR",
  timezone: "Europe/Berlin",
  currency: "EUR",
} as const;

// Singleton-Zugriff (siehe Vorgabe Punkt 21): legt die Zeile idempotent an,
// falls sie fehlt - identisch zum Muster von seedDefaultPipeline() in
// prisma/seed.ts. Wird sowohl vom Seed-Skript als auch (defensiv) von der
// Einstellungsseite selbst aufgerufen, falls die Zeile aus irgendeinem
// Grund fehlt (z. B. eine frische Datenbank ohne Seed-Lauf).
export async function ensureSystemSettings(
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const existing = await client.systemSettings.findFirst();
  if (existing) return existing;

  return client.systemSettings.create({ data: DEFAULT_SETTINGS });
}

export async function getSystemSettings() {
  return ensureSystemSettings();
}
