import { RangeFilter } from "@/components/filters/range-filter";
import { SearchInput } from "@/components/filters/search-input";
import { SelectFilter } from "@/components/filters/select-filter";
import { getActivityFilterOptions } from "../queries";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  contactLabel,
} from "../catalog";

export async function ActivityFiltersBar() {
  const { users, companies, contacts, leads, deals } = await getActivityFilterOptions();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SearchInput placeholder="Unternehmen, Kontakt, Lead, Deal, Dokumentnummer, Aktivität..." />
      <SelectFilter
        paramKey="category"
        label="Kategorie"
        allLabel="Alle Kategorien"
        options={ACTIVITY_CATEGORIES.map((value) => ({
          value,
          label: ACTIVITY_CATEGORY_LABELS[value],
        }))}
      />
      <SelectFilter
        paramKey="type"
        label="Aktivität"
        allLabel="Alle Aktivitäten"
        options={ACTIVITY_TYPES.map((value) => ({ value, label: ACTIVITY_LABELS[value] }))}
      />
      <SelectFilter
        paramKey="userId"
        label="Benutzer"
        allLabel="Alle Benutzer"
        options={users.map((user) => ({
          value: user.id,
          label: `${user.firstName} ${user.lastName}`,
        }))}
      />
      <SelectFilter
        paramKey="companyId"
        label="Unternehmen"
        allLabel="Alle Unternehmen"
        options={companies.map((company) => ({ value: company.id, label: company.name }))}
      />
      <SelectFilter
        paramKey="contactId"
        label="Kontakt"
        allLabel="Alle Kontakte"
        options={contacts.map((contact) => ({ value: contact.id, label: contactLabel(contact) }))}
      />
      <SelectFilter
        paramKey="leadId"
        label="Lead"
        allLabel="Alle Leads"
        options={leads.map((lead) => ({ value: lead.id, label: lead.title }))}
      />
      <SelectFilter
        paramKey="dealId"
        label="Deal"
        allLabel="Alle Deals"
        options={deals.map((deal) => ({ value: deal.id, label: deal.name }))}
      />
      <RangeFilter label="Zeitraum" type="date" minParamKey="dateFrom" maxParamKey="dateTo" />
    </div>
  );
}
