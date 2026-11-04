import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { User, UserRole } from "@/generated/prisma/client";

// Lädt den aktuellen Benutzer anhand der userId aus dem JWT immer frisch aus
// PostgreSQL - Rolle und isActive kommen NIE ausschließlich aus dem Token.
// Damit greifen Deaktivierung und Rollenänderungen spätestens beim nächsten
// serverseitigen Aufruf, unabhängig vom Ablaufdatum des JWT.
//
// Zusätzlich wird `authVersion` verglichen (siehe Vorgabe Punkt 8): das JWT
// trägt den authVersion-Wert vom Zeitpunkt des Logins als Claim. Weicht er
// vom aktuellen DB-Wert ab, wurde das Passwort zwischenzeitlich geändert
// (eigenständig oder administrativ) - die Session gilt dann als logisch
// ungültig, obwohl das JWT selbst noch nicht abgelaufen ist. Das ist die
// gewählte Lösung für "bestehende Sessions nach Passwortänderung
// invalidieren" unter der reinen JWT-Strategie (kein serverseitiger
// Session-Store vorhanden, der sonst dafür nötig wäre).
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.isActive) {
    return null;
  }

  if (session.user.authVersion !== user.authVersion) {
    return null;
  }

  return user;
}

// Für Server Components/Layouts, die eine ganze Route schützen: leitet ohne
// gültige Session (oder mit deaktiviertem Benutzer) zu /login weiter.
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

// Für Server Actions/Route Handler, bei denen ein Redirect unpassend ist:
// wirft einen typisierten Fehler, den error.tsx als generische Meldung zeigt.
export function requireRole(user: User, allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError();
  }
}
