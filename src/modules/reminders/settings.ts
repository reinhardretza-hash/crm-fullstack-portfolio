import { prisma } from "@/lib/prisma";

// Singleton (wie SystemSettings). Defaults: alles AUS - siehe schema.prisma.
export async function ensureReminderSettings() {
  const existing = await prisma.reminderSettings.findFirst();
  if (existing) return existing;
  try {
    return await prisma.reminderSettings.create({ data: {} });
  } catch {
    // Paralleler Erstellversuch (singleton UNIQUE): vorhandene Zeile lesen.
    return prisma.reminderSettings.findFirstOrThrow();
  }
}
