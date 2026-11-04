import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadForm } from "@/modules/leads/components/lead-form";
import { updateLeadAction } from "@/modules/leads/actions";
import { getLeadById, listPipelineOptions } from "@/modules/leads/queries";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listContactOptions } from "@/modules/contacts/queries";
import { listAssignableUsers } from "@/modules/users/queries";
import { centsToEuro } from "@/lib/money";
import { toDateTimeLocalValue } from "@/lib/datetime";

export const metadata: Metadata = {
  title: "Lead bearbeiten – RDEvolution CRM",
};

type EditLeadPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditLeadPage({ params }: EditLeadPageProps) {
  const { id } = await params;
  const [lead, pipelines, companies, contacts, users] = await Promise.all([
    getLeadById(id),
    listPipelineOptions(),
    listCompanyOptions(),
    listContactOptions(),
    listAssignableUsers(),
  ]);

  if (!lead) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Lead bearbeiten</h2>
      <LeadForm
        action={updateLeadAction.bind(null, lead.id)}
        pipelines={pipelines}
        companies={companies}
        contacts={contacts}
        users={users}
        defaultValues={{
          id: lead.id,
          version: lead.version,
          title: lead.title,
          companyId: lead.companyId,
          contactId: lead.contactId,
          pipelineId: lead.pipelineId,
          stageId: lead.stageId,
          source: lead.source,
          interest: lead.interest,
          expectedValueEuro:
            lead.expectedValueCents !== null ? String(centsToEuro(lead.expectedValueCents)) : "",
          priority: lead.priority,
          probability: lead.probability,
          assignedUserId: lead.assignedUserId,
          nextFollowUpAtLocal: toDateTimeLocalValue(lead.nextFollowUpAt),
          description: lead.description,
        }}
      />
    </div>
  );
}
