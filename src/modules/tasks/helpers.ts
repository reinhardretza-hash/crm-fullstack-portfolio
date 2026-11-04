import { contactDisplayName } from "@/modules/contacts/helpers";

type TaskCrmTarget = {
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  lead: { id: string; title: string } | null;
  deal: { id: string; name: string } | null;
};

// Eine Aufgabe hat höchstens EIN CRM-Ziel (siehe Validierung) - diese
// Helper geben für die Anzeige ("verknüpft mit") einheitlich das erste
// (und einzige) gesetzte Ziel zurück, statt die Fallunterscheidung an
// jeder Stelle zu wiederholen.
export function taskCrmTargetLabel(task: TaskCrmTarget): string | null {
  if (task.company) return task.company.name;
  if (task.contact) return contactDisplayName(task.contact);
  if (task.lead) return task.lead.title;
  if (task.deal) return task.deal.name;
  return null;
}

export function taskCrmTargetHref(task: TaskCrmTarget): string | null {
  if (task.company) return `/companies/${task.company.id}`;
  if (task.contact) return `/contacts/${task.contact.id}`;
  if (task.lead) return `/leads/${task.lead.id}`;
  if (task.deal) return `/deals/${task.deal.id}`;
  return null;
}
