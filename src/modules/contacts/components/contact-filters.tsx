import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { CONTACT_STATUS_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listAssignableUsers } from "@/modules/users/queries";

export async function ContactFiltersBar() {
  const [companies, users] = await Promise.all([listCompanyOptions(), listAssignableUsers()]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchInput placeholder="Name, E-Mail, Telefon, LinkedIn, Unternehmen..." />
      <SelectFilter
        paramKey="status"
        label="Status"
        allLabel="Alle Status"
        options={Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="source"
        label="Quelle"
        allLabel="Alle Quellen"
        options={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="companyId"
        label="Unternehmen"
        allLabel="Alle"
        options={companies.map((company) => ({ value: company.id, label: company.name }))}
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
