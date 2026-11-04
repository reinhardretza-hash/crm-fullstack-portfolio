import type { ReactNode } from "react";
import type { User } from "@/generated/prisma/client";
import { canAccessAdministration, hasPermission, PERMISSIONS } from "@/server/permissions";
import { AppShellClient } from "./app-shell-client";

type AppShellProps = {
  user: User;
  children: ReactNode;
};

// Server Component: berechnet die Berechtigungen serverseitig über die
// zentrale Permissions-Funktion und reicht nur das Ergebnis (Booleans) an
// die Client-Komponenten weiter - die Rollenlogik selbst lebt an genau
// einer Stelle (src/server/permissions.ts), nicht verteilt im UI-Code.
export function AppShell({ user, children }: AppShellProps) {
  const permissions = PERMISSIONS.filter((permission) => hasPermission(user, permission));

  return (
    <AppShellClient
      firstName={user.firstName}
      lastName={user.lastName}
      role={user.role}
      canManageAdministration={canAccessAdministration(user)}
      permissions={permissions}
    >
      {children}
    </AppShellClient>
  );
}
