import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { UserTable } from "@/modules/users/components/user-table";
import { listUsersForAdmin } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Benutzerverwaltung – RDEvolution CRM",
};

export default async function UsersSettingsPage() {
  const user = await requireUser();
  requirePagePermission(user, "USER_MANAGE");

  const users = await listUsersForAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black">Benutzerverwaltung</h2>
        <Link
          href="/settings/users/new"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          + Benutzer anlegen
        </Link>
      </div>

      <Card>
        <UserTable users={users} />
      </Card>
    </div>
  );
}
