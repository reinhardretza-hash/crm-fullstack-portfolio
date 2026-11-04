import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/rbac";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Anmelden – RDEvolution CRM",
};

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-[0.2em] text-[var(--gold)] uppercase">
          RDEvolution
        </p>
        <h1 className="text-xl font-semibold text-white">Anmelden</h1>
        <p className="text-sm text-white/50">
          Interner Zugang für Mitarbeiter von RDEvolution GbR.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}
