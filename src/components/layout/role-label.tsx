import type { UserRole } from "@/generated/prisma/client";

// Rein kosmetische Übersetzung für die Anzeige - trifft KEINE
// Sicherheitsentscheidung. Die serverseitige RBAC-Logik (src/server/rbac.ts)
// bleibt in jedem Fall maßgeblich, unabhängig davon, was hier angezeigt wird.
const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Administrator",
  ADMIN: "Admin",
  USER: "Benutzer",
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
