"use server";

import { AuthError } from "next-auth";
import { auth, signIn, signOut } from "@/lib/auth";
import { GENERIC_LOGIN_ERROR } from "@/modules/auth/config";
import { writeAuthAuditLog } from "@/modules/auth/audit";

export type LoginActionState = {
  error: string | null;
};

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
    return { error: null };
  } catch (error) {
    // signIn() löst bei Erfolg intern einen Redirect aus, der als spezieller
    // Next.js-Kontrollfluss-Fehler geworfen wird - dieser muss unverändert
    // weitergeworfen werden, sonst würde die Weiterleitung nicht greifen.
    if (error instanceof AuthError) {
      return { error: GENERIC_LOGIN_ERROR };
    }
    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    await writeAuthAuditLog({ action: "LOGOUT", userId });
  }

  await signOut({ redirectTo: "/login" });
}
