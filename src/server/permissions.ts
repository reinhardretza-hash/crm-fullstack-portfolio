import type { User, UserRole } from "@/generated/prisma/client";
import { ForbiddenError } from "@/lib/errors";

// Zentrale, benannte Berechtigungen statt verstreuter `role === "..."`-
// Prüfungen (siehe Vorgabe Punkt 5). Die interne Umsetzung bleibt bewusst
// rollenbasiert (kein vollständiges Permission-DB-System) - aber jede
// Admin-Route/Server-Action prüft eine dieser benannten Permissions, nie
// die Rolle direkt. Das macht spätere Verschiebungen zwischen den Rollen
// (z. B. ADMIN bekommt zusätzlich AUDIT_VIEW) zu einer einzigen Änderung
// an dieser Stelle, nicht an zig Aufrufstellen.
export const PERMISSIONS = [
  "USER_MANAGE",
  "PIPELINE_MANAGE",
  "TAG_MANAGE",
  "SETTINGS_MANAGE",
  "AUDIT_VIEW",
  "LEAD_SCORING_MANAGE",
  "EMAIL_SEND",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Konkrete Rollenmatrix (siehe Vorgabe Punkt 5):
// - OWNER: vollständige Administration (alle Permissions).
// - ADMIN: operative CRM-Administration (Pipeline/Tags/Lead-Scoring) -
//   bewusst OHNE Benutzerverwaltung, allgemeine Einstellungen und
//   AuditLog-Einsicht, da das sicherheitskritische/organisatorische
//   Themen sind, die einem ADMIN nicht automatisch zustehen sollen.
// - USER: keine Admin-Permissions.
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: ["PIPELINE_MANAGE", "TAG_MANAGE", "LEAD_SCORING_MANAGE", "EMAIL_SEND"],
  USER: ["EMAIL_SEND"],
};

export function hasPermission(user: Pick<User, "role">, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

// Für Server Actions/Route Handler: wirft, statt einen Boolean
// zurückzugeben - macht Aufrufstellen knapp und einheitlich.
export function requirePermission(user: Pick<User, "role">, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenError();
  }
}

// Steuert nur, ob die Administration-Sektion in der Sidebar überhaupt
// sichtbar ist (irgendeine Admin-Permission) - ersetzt die bisherige
// OWNER-exklusive `canManageUsers`. Die serverseitige Durchsetzung pro
// Route bleibt davon unabhängig über `requirePermission` (siehe Vorgabe
// Punkt 27: Sidebar-Sichtbarkeit ist kein Sicherheitsmechanismus).
export function canAccessAdministration(user: Pick<User, "role">): boolean {
  return PERMISSIONS.some(
    (permission) => permission !== "EMAIL_SEND" && hasPermission(user, permission),
  );
}
