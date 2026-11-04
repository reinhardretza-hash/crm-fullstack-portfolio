import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { COMPANY_SIZE_LABELS, COMPANY_STATUS_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import { listAssignableUsers } from "@/modules/users/queries";

export async function CompanyFiltersBar() {
  const users = await listAssignableUsers();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchInput placeholder="Firmenname, Website, E-Mail, Ort..." />
      <SelectFilter
        paramKey="status"
        label="Status"
        allLabel="Alle Status"
        options={Object.entries(COMPANY_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="source"
        label="Quelle"
        allLabel="Alle Quellen"
        options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="companySize"
        label="Größe"
        allLabel="Alle Größen"
        options={Object.entries(COMPANY_SIZE_LABELS).map(([value, label]) => ({ value, label }))}
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
