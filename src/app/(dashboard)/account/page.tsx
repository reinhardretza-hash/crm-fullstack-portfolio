import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/rbac";
import { ChangeOwnPasswordForm } from "@/modules/users/components/change-own-password-form";

export const metadata: Metadata = {
  title: "Mein Konto – RDEvolution CRM",
};

// Bewusst NICHT unter /settings (dort greift die Administration-
// Zugriffssperre) - das eigene Passwort ändern darf JEDER authentifizierte
// Benutzer, unabhängig von Admin-Permissions (siehe Vorgabe Punkt 8).
export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Mein Konto</h2>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            {user.firstName} {user.lastName}
          </p>
          <p className="text-secondary">{user.email}</p>
        </CardContent>
      </Card>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle>Passwort ändern</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeOwnPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
