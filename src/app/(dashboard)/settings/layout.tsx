import { notFound } from "next/navigation";
import { requireUser } from "@/server/rbac";
import { canAccessAdministration } from "@/server/permissions";

// Grobe Zugriffssperre für den gesamten /settings-Baum: wer KEINE einzige
// Admin-Permission hat, bekommt 404 - unabhängig davon, ob die Sidebar den
// Link überhaupt zeigt (siehe Vorgabe Punkt 27: direkter URL-Aufruf muss
// serverseitig blockiert werden). Die feingranulare Prüfung (z. B.
// USER_MANAGE nur für /settings/users) erfolgt zusätzlich auf jeder
// einzelnen Seite/Server Action über requirePermission().
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  if (!canAccessAdministration(user)) {
    notFound();
  }

  return <>{children}</>;
}
