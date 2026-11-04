import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { UserForm } from "@/modules/users/components/user-form";
import { UserStatusToggle } from "@/modules/users/components/user-status-toggle";
import { SetPasswordForm } from "@/modules/users/components/set-password-form";
import { updateUserAction } from "@/modules/users/actions";
import { getUserById } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Benutzer bearbeiten – RDEvolution CRM",
};

type EditUserPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditUserPage({ params }: EditUserPageProps) {
  const actingUser = await requireUser();
  requirePagePermission(actingUser, "USER_MANAGE");

  const { id } = await params;
  const targetUser = await getUserById(id);
  if (!targetUser) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">
        Benutzer bearbeiten: {targetUser.firstName} {targetUser.lastName}
      </h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UserForm
            action={updateUserAction.bind(null, targetUser.id)}
            mode="edit"
            defaultValues={{
              firstName: targetUser.firstName,
              lastName: targetUser.lastName,
              email: targetUser.email,
              role: targetUser.role,
            }}
          />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <UserStatusToggle userId={targetUser.id} isActive={targetUser.isActive} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Passwort zurücksetzen</CardTitle>
            </CardHeader>
            <CardContent>
              <SetPasswordForm userId={targetUser.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
