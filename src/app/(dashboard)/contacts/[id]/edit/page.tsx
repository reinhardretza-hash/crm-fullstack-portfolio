import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/modules/contacts/components/contact-form";
import { updateContactAction } from "@/modules/contacts/actions";
import { getContactById } from "@/modules/contacts/queries";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Kontakt bearbeiten – RDEvolution CRM",
};

type EditContactPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditContactPage({ params }: EditContactPageProps) {
  const { id } = await params;
  const [contact, users, companies] = await Promise.all([
    getContactById(id),
    listAssignableUsers(),
    listCompanyOptions(),
  ]);

  if (!contact) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Kontakt bearbeiten</h2>
      <ContactForm
        action={updateContactAction.bind(null, contact.id)}
        users={users}
        companies={companies}
        defaultValues={{
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          jobTitle: contact.jobTitle,
          companyId: contact.companyId,
          email: contact.email,
          phone: contact.phone,
          mobile: contact.mobile,
          linkedinUrl: contact.linkedinUrl,
          website: contact.website,
          source: contact.source,
          status: contact.status,
          assignedUserId: contact.assignedUserId,
          tags: contact.tags.map((contactTag) => contactTag.tag.name),
        }}
      />
    </div>
  );
}
