import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/crm-labels";
import { listAssignableUsers } from "@/modules/users/queries";

export async function TaskFiltersBar() {
  const users = await listAssignableUsers();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchInput placeholder="Titel, Beschreibung, Unternehmen, Kontakt, Lead, Deal..." />
      <SelectFilter
        paramKey="status"
        label="Status"
        allLabel="Alle Status"
        options={Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="priority"
        label="Priorität"
        allLabel="Alle"
        options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="assignedUserId"
        label="Verantwortlicher"
        allLabel="Alle"
        options={users.map((user) => ({
          value: user.id,
          label: `${user.firstName} ${user.lastName}`,
        }))}
      />
    </div>
  );
}
