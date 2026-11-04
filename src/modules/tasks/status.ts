import type { TaskStatus } from "@/generated/prisma/client";

export type TaskStatusPatch = {
  status: TaskStatus;
  completedAt: Date | null;
};

// EINZIGE Stelle, die aus einem Statuswechsel (Erledigt/Wieder öffnen) den
// resultierenden Datensatz-Patch ableitet - wird von
// src/modules/tasks/actions.ts aufgerufen, nicht dupliziert. Pure
// Funktionen (kein DB-Zugriff) - direkt unit-testbar.
export function taskCompletePatch(now: Date = new Date()): TaskStatusPatch {
  return { status: "COMPLETED", completedAt: now };
}

// Reopen setzt bewusst auf OPEN zurück (nicht IN_PROGRESS) - unabhängig
// davon, in welchem Status die Aufgabe vor dem Erledigen war. Für Version 1
// ausreichend: der Benutzer kann den Status nach dem Wiedereröffnen über
// das normale Bearbeiten-Formular gezielt auf IN_PROGRESS setzen, wenn
// gewünscht.
export function taskReopenPatch(): TaskStatusPatch {
  return { status: "OPEN", completedAt: null };
}
