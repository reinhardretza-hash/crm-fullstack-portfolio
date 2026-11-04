import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyForm } from "@/modules/companies/components/company-form";
import { updateCompanyAction } from "@/modules/companies/actions";
import { getCompanyById } from "@/modules/companies/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Unternehmen bearbeiten – RDEvolution CRM",
};

type EditCompanyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCompanyPage({ params }: EditCompanyPageProps) {
  const { id } = await params;
  const [company, users] = await Promise.all([getCompanyById(id), listAssignableUsers()]);

  if (!company) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Unternehmen bearbeiten</h2>
      <CompanyForm
        action={updateCompanyAction.bind(null, company.id)}
        users={users}
        defaultValues={{
          id: company.id,
          name: company.name,
          website: company.website,
          industry: company.industry,
          phone: company.phone,
          email: company.email,
          street: company.street,
          postalCode: company.postalCode,
          city: company.city,
          country: company.country,
          employeeCount: company.employeeCount,
          companySize: company.companySize,
          description: company.description,
          status: company.status,
          source: company.source,
          assignedUserId: company.assignedUserId,
          needs: company.needs.map((need) => need.need),
          tags: company.tags.map((companyTag) => companyTag.tag.name),
        }}
      />
    </div>
  );
}
