import { SelectFilter } from "@/components/filters/select-filter";
import { RangeFilter } from "@/components/filters/range-filter";
import { listAssignableUsers } from "@/modules/users/queries";

// Dieselbe Werteliste wie CrmAuditAction in src/modules/audit/log.ts -
// bewusst hier als Laufzeit-Array wiederholt (ein TS-Union-Typ existiert
// zur Laufzeit nicht, kann also nicht direkt iteriert werden), nicht
// generiert, damit diese Datei unabhängig vom genauen Typ-Importpfad bleibt.
const ACTIONS = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_ROLE_CHANGED",
  "USER_ACTIVATED",
  "USER_DEACTIVATED",
  "USER_PASSWORD_RESET",
  "USER_PASSWORD_CHANGED",
  "PIPELINE_UPDATED",
  "PIPELINE_STAGE_UPDATED",
  "PIPELINE_STAGE_REORDERED",
  "PIPELINE_STAGE_DELETED",
  "TAG_CREATED",
  "TAG_UPDATED",
  "TAG_DELETED",
  "SETTINGS_UPDATED",
  "LEAD_SCORING_UPDATED",
  "COMPANY_CREATED",
  "COMPANY_UPDATED",
  "COMPANY_DELETED",
  "CONTACT_CREATED",
  "CONTACT_UPDATED",
  "CONTACT_DELETED",
  "LEAD_CREATED",
  "LEAD_UPDATED",
  "LEAD_DELETED",
  "LEAD_STAGE_CHANGED",
  "LEAD_WON",
  "LEAD_LOST",
  "DEAL_CREATED",
  "DEAL_UPDATED",
  "DEAL_DELETED",
  "DEAL_WON",
  "DEAL_LOST",
  "DEAL_REOPENED",
  "TASK_CREATED",
  "TASK_UPDATED",
  "TASK_COMPLETED",
  "TASK_REOPENED",
  "TASK_DELETED",
  "NOTE_CREATED",
] as const;

const ENTITY_TYPES = [
  "User",
  "Pipeline",
  "PipelineStage",
  "Tag",
  "SystemSettings",
  "LeadScoreRule",
  "Company",
  "Contact",
  "Lead",
  "Deal",
  "Task",
  "Note",
] as const;

export async function AuditFiltersBar() {
  const users = await listAssignableUsers();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <SelectFilter
        paramKey="userId"
        label="Benutzer"
        allLabel="Alle"
        options={users.map((user) => ({
          value: user.id,
          label: `${user.firstName} ${user.lastName}`,
        }))}
      />
      <SelectFilter
        paramKey="action"
        label="Aktion"
        allLabel="Alle"
        options={ACTIONS.map((action) => ({ value: action, label: action }))}
      />
      <SelectFilter
        paramKey="entityType"
        label="Entity Type"
        allLabel="Alle"
        options={ENTITY_TYPES.map((entityType) => ({ value: entityType, label: entityType }))}
      />
      <RangeFilter label="Zeitraum" type="date" minParamKey="dateFrom" maxParamKey="dateTo" />
    </div>
  );
}
