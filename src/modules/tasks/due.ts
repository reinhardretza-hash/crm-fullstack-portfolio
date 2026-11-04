import type { TaskStatus } from "@/generated/prisma/client";
import { isSameDayInTimeZone } from "@/lib/timezone";

type DueTask = { status: TaskStatus; dueAt: Date };

// EINZIGE Stelle, die "überfällig" definiert - niemals an mehreren Stellen
// unterschiedliche Datumslogik schreiben (siehe Vorgabe). Eine erledigte
// Aufgabe ist nie überfällig, egal wie weit `dueAt` in der Vergangenheit liegt.
export function isTaskOverdue(task: DueTask, now: Date = new Date()): boolean {
  return task.status !== "COMPLETED" && task.dueAt.getTime() < now.getTime();
}

// "Heute" wird nach dem Kalendertag in Europe/Berlin beurteilt (siehe
// src/lib/timezone.ts), NICHT nach dem UTC-Kalendertag - ein um 23:30 Uhr
// Berlin fälliges Task wäre sonst im Sommer (UTC+2) bereits "morgen" in UTC.
export function isTaskDueToday(task: { dueAt: Date }, now: Date = new Date()): boolean {
  return isSameDayInTimeZone(task.dueAt, now);
}

// Zentral konfiguriertes Zeitfenster für "kommende" Aufgaben (siehe
// Vorgabe Punkt 21) - an einer Stelle geändert, nicht über mehrere Queries
// verstreut.
export const UPCOMING_WINDOW_DAYS = 7;

// "Kommend" = offen (nicht erledigt), nicht überfällig, nicht heute fällig,
// und innerhalb des konfigurierten Zeitfensters. Die drei Kategorien
// überfällig/heute/kommend sind bewusst gegenseitig exklusiv, damit eine
// Aufgabe nie in zwei Dashboard-Abschnitten gleichzeitig auftaucht.
export function isTaskUpcoming(task: DueTask, now: Date = new Date()): boolean {
  if (task.status === "COMPLETED") return false;
  if (isTaskOverdue(task, now)) return false;
  if (isTaskDueToday(task, now)) return false;
  const windowEnd = now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return task.dueAt.getTime() <= windowEnd;
}
