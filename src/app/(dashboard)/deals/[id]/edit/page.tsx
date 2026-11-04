import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DealForm } from "@/modules/deals/components/deal-form";
import { updateDealAction } from "@/modules/deals/actions";
import { getDealById } from "@/modules/deals/queries";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listContactOptions } from "@/modules/contacts/queries";
import { listLeadOptions } from "@/modules/leads/queries";
import { listAssignableUsers } from "@/modules/users/queries";
import { centsToEuro } from "@/lib/money";

export const metadata: Metadata = {
  title: "Deal bearbeiten – RDEvolution CRM",
};

type EditDealPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDealPage({ params }: EditDealPageProps) {
  const { id } = await params;
  const [deal, companies, contacts, leads, users] = await Promise.all([
    getDealById(id),
    listCompanyOptions(),
    listContactOptions(),
    listLeadOptions(),
    listAssignableUsers(),
  ]);

  if (!deal) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Deal bearbeiten</h2>
      <DealForm
        action={updateDealAction.bind(null, deal.id)}
        companies={companies}
        contacts={contacts}
        leads={leads}
        users={users}
        defaultValues={{
          id: deal.id,
          version: deal.version,
          name: deal.name,
          companyId: deal.companyId,
          contactId: deal.contactId,
          leadId: deal.leadId,
          assignedUserId: deal.assignedUserId,
          service: deal.service,
          valueEuro: String(centsToEuro(deal.valueCents)),
          probability: deal.probability,
          expectedCloseDateLocal: deal.expectedCloseDate
            ? deal.expectedCloseDate.toISOString().slice(0, 10)
            : "",
          description: deal.description,
        }}
      />
    </div>
  );
}
