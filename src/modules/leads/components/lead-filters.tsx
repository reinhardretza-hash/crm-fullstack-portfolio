import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import {
  LEAD_STATUS_LABELS,
  POTENTIAL_NEED_LABELS,
  PRIORITY_LABELS,
  SOURCE_LABELS,
} from "@/lib/crm-labels";
import { listPipelineOptions } from "@/modules/leads/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export async function LeadFiltersBar() {
  const [pipelines, users] = await Promise.all([listPipelineOptions(), listAssignableUsers()]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchInput placeholder="Lead-Titel, Firmenname, Kontaktname..." />
      <SelectFilter
        paramKey="pipelineId"
        label="Pipeline"
        allLabel="Alle Pipelines"
        options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
      />
      <SelectFilter
        paramKey="status"
        label="Status"
        allLabel="Alle Status"
        options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="priority"
        label="Priorität"
        allLabel="Alle"
        options={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="interest"
        label="Interesse"
        allLabel="Alle"
        options={Object.entries(POTENTIAL_NEED_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="source"
        label="Quelle"
        allLabel="Alle Quellen"
        options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
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
      <SelectFilter
        paramKey="overdue"
        label="Follow-up"
        allLabel="Alle"
        options={[{ value: "true", label: "Nur überfällige" }]}
      />
    </div>
  );
}
