import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/rbac";

// requireUser() lädt den Benutzer frisch aus PostgreSQL und leitet zu /login
// weiter, falls keine gültige Session besteht ODER der Benutzer inzwischen
// deaktiviert wurde - ein technisch noch gültiges JWT reicht dafür nicht aus.
// Ein einziges Layout für alle geschützten CRM-Seiten - keine duplizierte
// Shell pro Seite.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
