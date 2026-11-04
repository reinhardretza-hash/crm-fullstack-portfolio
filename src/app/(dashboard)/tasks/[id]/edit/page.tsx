import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaskForm } from "@/modules/tasks/components/task-form";
import { updateTaskAction } from "@/modules/tasks/actions";
import { getTaskById } from "@/modules/tasks/queries";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listContactOptions } from "@/modules/contacts/queries";
import { listLeadOptions } from "@/modules/leads/queries";
import { listDealOptions } from "@/modules/deals/queries";
import { listAssignableUsers } from "@/modules/users/queries";
import { splitUtcToBerlinDateAndTime } from "@/lib/timezone";

export const metadata: Metadata = {
  title: "Aufgabe bearbeiten – RDEvolution CRM",
};

type EditTaskPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTaskPage({ params }: EditTaskPageProps) {
  const { id } = await params;
  const [task, companies, contacts, leads, deals, users] = await Promise.all([
    getTaskById(id),
    listCompanyOptions(),
    listContactOptions(),
    listLeadOptions(),
    listDealOptions(),
    listAssignableUsers(),
  ]);

  if (!task) {
    notFound();
  }

  const due = splitUtcToBerlinDateAndTime(task.dueAt);
  const reminder = task.reminderAt ? splitUtcToBerlinDateAndTime(task.reminderAt) : null;

  const targetType = task.companyId
    ? "company"
    : task.contactId
      ? "contact"
      : task.leadId
        ? "lead"
        : task.dealId
          ? "deal"
          : ("" as const);
  const targetId = task.companyId ?? task.contactId ?? task.leadId ?? task.dealId ?? "";

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Aufgabe bearbeiten</h2>
      <TaskForm
        action={updateTaskAction.bind(null, task.id)}
        companies={companies}
        contacts={contacts}
        leads={leads}
        deals={deals}
        users={users}
        defaultValues={{
          id: task.id,
          version: task.version,
          title: task.title,
          description: task.description,
          assignedUserId: task.assignedUserId,
          status: task.status,
          priority: task.priority,
          dueDate: due.dateStr,
          dueTime: due.hadExplicitTime ? due.timeStr : "",
          reminderDate: reminder?.dateStr ?? "",
          reminderTime: reminder?.hadExplicitTime ? reminder.timeStr : "",
          targetType,
          targetId,
        }}
      />
    </div>
  );
}
