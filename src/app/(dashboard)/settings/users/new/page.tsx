import type { Metadata } from "next";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { UserForm } from "@/modules/users/components/user-form";
import { createUserAction } from "@/modules/users/actions";

export const metadata: Metadata = {
  title: "Benutzer anlegen – RDEvolution CRM",
};

export default async function NewUserPage() {
  const user = await requireUser();
  requirePagePermission(user, "USER_MANAGE");

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Benutzer anlegen</h2>
      <UserForm action={createUserAction} mode="create" />
    </div>
  );
}
