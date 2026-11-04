import type { Metadata } from "next";
import { ContactForm } from "@/modules/contacts/components/contact-form";
import { createContactAction } from "@/modules/contacts/actions";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Kontakt erstellen – RDEvolution CRM",
};

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const [users, companies] = await Promise.all([listAssignableUsers(), listCompanyOptions()]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Kontakt erstellen</h2>
      <ContactForm action={createContactAction} users={users} companies={companies} />
    </div>
  );
}
