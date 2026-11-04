import type { Metadata } from "next";
import { DealForm } from "@/modules/deals/components/deal-form";
import { createDealAction } from "@/modules/deals/actions";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listContactOptions } from "@/modules/contacts/queries";
import { listLeadOptions, getLeadById } from "@/modules/leads/queries";
import { listAssignableUsers } from "@/modules/users/queries";
import { centsToEuro } from "@/lib/money";

export const metadata: Metadata = {
  title: "Deal erstellen – RDEvolution CRM",
};

export const dynamic = "force-dynamic";

type NewDealPageProps = {
  searchParams: Promise<{ leadId?: string }>;
};

export default async function NewDealPage({ searchParams }: NewDealPageProps) {
  const { leadId } = await searchParams;

  const [companies, contacts, leads, users, prefillLead] = await Promise.all([
    listCompanyOptions(),
    listContactOptions(),
    listLeadOptions(),
    listAssignableUsers(),
    leadId ? getLeadById(leadId) : Promise.resolve(null),
  ]);

  // Werte aus dem Lead sinnvoll vorbefüllen (siehe Vorgabe Punkt 7), aber
  // der Benutzer muss sie vor dem Speichern noch bearbeiten können - daher
  // normale `defaultValue`s im Formular, keine automatische Erstellung.
  const defaultValues = prefillLead
    ? {
        name: prefillLead.title,
        companyId: prefillLead.companyId ?? "",
        contactId: prefillLead.contactId,
        leadId: prefillLead.id,
        assignedUserId: prefillLead.assignedUserId,
        service: prefillLead.interest ?? "",
        valueEuro:
          prefillLead.expectedValueCents !== null
            ? String(centsToEuro(prefillLead.expectedValueCents))
            : "",
        probability: prefillLead.probability,
        expectedCloseDateLocal: "",
        description: null,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Deal erstellen</h2>
      <DealForm
        action={createDealAction}
        companies={companies}
        contacts={contacts}
        leads={leads}
        users={users}
        defaultValues={defaultValues}
      />
    </div>
  );
}
