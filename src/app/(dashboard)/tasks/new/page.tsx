import type { Metadata } from "next";
import { TaskForm } from "@/modules/tasks/components/task-form";
import { createTaskAction } from "@/modules/tasks/actions";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listContactOptions } from "@/modules/contacts/queries";
import { listLeadOptions } from "@/modules/leads/queries";
import { listDealOptions } from "@/modules/deals/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export const metadata: Metadata = {
  title: "Aufgabe erstellen – RDEvolution CRM",
};

export const dynamic = "force-dynamic";

type NewTaskPageProps = {
  searchParams: Promise<{
    companyId?: string;
    contactId?: string;
    leadId?: string;
    dealId?: string;
  }>;
};

export default async function NewTaskPage({ searchParams }: NewTaskPageProps) {
  const { companyId, contactId, leadId, dealId } = await searchParams;

  const [companies, contacts, leads, deals, users] = await Promise.all([
    listCompanyOptions(),
    listContactOptions(),
    listLeadOptions(),
    listDealOptions(),
    listAssignableUsers(),
  ]);

  // Vorausgefülltes Ziel beim Aufruf von einer CRM-Detailseite (siehe
  // Vorgabe Punkt 16) - der Benutzer kann es vor dem Speichern noch
  // ändern, es wird nichts automatisch erzeugt.
  const prefillTargetType = companyId
    ? "company"
    : contactId
      ? "contact"
      : leadId
        ? "lead"
        : dealId
          ? "deal"
          : "";
  const prefillTargetId = companyId ?? contactId ?? leadId ?? dealId ?? "";

  const defaultValues = prefillTargetType
    ? {
        title: "",
        description: null,
        assignedUserId: "",
        status: "OPEN",
        priority: "NORMAL",
        dueDate: "",
        dueTime: "",
        reminderDate: "",
        reminderTime: "",
        targetType: prefillTargetType as "company" | "contact" | "lead" | "deal",
        targetId: prefillTargetId,
      }
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Aufgabe erstellen</h2>
      <TaskForm
        action={createTaskAction}
        companies={companies}
        contacts={contacts}
        leads={leads}
        deals={deals}
        users={users}
        defaultValues={defaultValues}
      />
    </div>
  );
}
