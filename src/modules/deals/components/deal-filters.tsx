import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { RangeFilter } from "@/components/filters/range-filter";
import { DEAL_STATUS_LABELS, POTENTIAL_NEED_LABELS } from "@/lib/crm-labels";
import { listCompanyOptions } from "@/modules/companies/queries";
import { listAssignableUsers } from "@/modules/users/queries";
import { DealValueRangeFilter } from "./deal-value-range-filter";

export async function DealFiltersBar() {
  const [companies, users] = await Promise.all([listCompanyOptions(), listAssignableUsers()]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchInput placeholder="Deal-Name, Firmenname, Kontaktname..." />
      <SelectFilter
        paramKey="status"
        label="Status"
        allLabel="Alle Status"
        options={Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <SelectFilter
        paramKey="service"
        label="Leistung"
        allLabel="Alle"
        options={Object.entries(POTENTIAL_NEED_LABELS).map(([value, label]) => ({ value, label }))}
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
        paramKey="companyId"
        label="Unternehmen"
        allLabel="Alle"
        options={companies.map((company) => ({ value: company.id, label: company.name }))}
      />
      <RangeFilter
        label="Erwarteter Abschluss"
        type="date"
        minParamKey="closeDateFrom"
        maxParamKey="closeDateTo"
      />
      <DealValueRangeFilter />
    </div>
  );
}
