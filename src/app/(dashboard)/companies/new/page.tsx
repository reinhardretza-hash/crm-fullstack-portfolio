import type { Metadata } from "next";
import { CompanyForm } from "@/modules/companies/components/company-form";
import { createCompanyAction } from "@/modules/companies/actions";
import { listAssignableUsers } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Unternehmen erstellen – RDEvolution CRM",
};

// Lädt bei jedem Aufruf die aktuelle Benutzerliste (für "Verantwortlicher")
// - eine statische Prerender-Version ergäbe keinen Sinn und würde beim
// Build ohne laufende Datenbank ohnehin fehlschlagen.
export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const users = await listAssignableUsers();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Unternehmen erstellen</h2>
      <CompanyForm action={createCompanyAction} users={users} />
    </div>
  );
}
