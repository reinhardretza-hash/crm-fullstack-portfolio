import { prisma } from "@/lib/prisma";

// Für Zuweisungs-Dropdowns (Company/Contact "Verantwortlicher") - nur aktive
// Benutzer, damit niemand einem bereits deaktivierten Account neu zugewiesen
// werden kann.
export async function listAssignableUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
}

// Für /settings/users (siehe Vorgabe Punkt 1/2): zeigt alle Benutzer
// (aktiv UND inaktiv - es gibt bewusst keine Papierkorb-UI, Deaktivierung
// ist der einzige "weg"-Zustand) inklusive optionaler Zuweisungszahlen
// über `_count`, ohne eine Query pro Benutzer zu brauchen.
export async function listUsersForAdmin() {
  return prisma.user.findMany({
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { assignedLeads: true, assignedDeals: true, assignedTasks: true },
      },
    },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// Für den OWNER-Schutz in der UI (z. B. Deaktivieren-Button ausgrauen,
// bevor der Benutzer überhaupt erst den serverseitigen Fehler sieht) -
// die eigentliche Durchsetzung bleibt in src/modules/users/owner-guard.ts.
export async function countActiveOwners(): Promise<number> {
  return prisma.user.count({ where: { role: "OWNER", isActive: true } });
}
