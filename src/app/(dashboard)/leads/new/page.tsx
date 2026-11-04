import type { Metadata } from "next";
import { LeadForm } from "@/modules/leads/components/lead-form";
import { createLeadAction } from "@/modules/leads/actions";
import { listPipelineOptions } from "@/modules/leads/queries";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listContactOptions } from "@/modules/contacts/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Lead erstellen – RDEvolution CRM",
};

export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const [pipelines, companies, contacts, users] = await Promise.all([
    listPipelineOptions(),
    listCompanyOptions(),
    listContactOptions(),
    listAssignableUsers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Lead erstellen</h2>
      <LeadForm
        action={createLeadAction}
        pipelines={pipelines}
        companies={companies}
        contacts={contacts}
        users={users}
      />
    </div>
  );
}
