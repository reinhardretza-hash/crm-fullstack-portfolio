"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABELS, POTENTIAL_NEED_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import type { LeadActionState } from "../actions";

type PipelineOption = { id: string; name: string; stages: { id: string; name: string }[] };
type CompanyOption = { id: string; name: string };
type ContactOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyId: string | null;
};
type UserOption = { id: string; firstName: string; lastName: string };

type LeadFormProps = {
  action: (state: LeadActionState, formData: FormData) => Promise<LeadActionState>;
  pipelines: PipelineOption[];
  companies: CompanyOption[];
  contacts: ContactOption[];
  users: UserOption[];
  defaultValues?: {
    id?: string;
    version?: number;
    title: string;
    companyId: string | null;
    contactId: string | null;
    pipelineId: string;
    stageId: string;
    source: string | null;
    interest: string | null;
    expectedValueEuro: string;
    priority: string;
    probability: number | null;
    assignedUserId: string | null;
    nextFollowUpAtLocal: string;
    description: string | null;
  };
};

const initialState: LeadActionState = { error: null };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

function contactLabel(contact: ContactOption): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(Ohne Namen)";
}

export function LeadForm({
  action,
  pipelines,
  companies,
  contacts,
  users,
  defaultValues,
}: LeadFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [companyId, setCompanyId] = useState(defaultValues?.companyId ?? "");
  const [pipelineId, setPipelineId] = useState(defaultValues?.pipelineId ?? pipelines[0]?.id ?? "");

  const selectedPipeline = pipelines.find((pipeline) => pipeline.id === pipelineId);

  // Bevorzugt Kontakte des gewählten Unternehmens, blockiert andere aber
  // nicht (siehe Vorgabe) - optisch über zwei Gruppen getrennt.
  const { matchingContacts, otherContacts } = useMemo(() => {
    if (!companyId) return { matchingContacts: [], otherContacts: contacts };
    return {
      matchingContacts: contacts.filter((c) => c.companyId === companyId),
      otherContacts: contacts.filter((c) => c.companyId !== companyId),
    };
  }, [contacts, companyId]);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {defaultValues?.id && (
        <input type="hidden" name="expectedVersion" value={defaultValues.version ?? ""} />
      )}
      <Field label="Titel" htmlFor="title" required>
        <input
          id="title"
          name="title"
          required
          defaultValue={defaultValues?.title ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Unternehmen" htmlFor="companyId">
          <select
            id="companyId"
            name="companyId"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            className={inputClass}
          >
            <option value="">–</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kontakt" htmlFor="contactId">
          <select
            id="contactId"
            name="contactId"
            defaultValue={defaultValues?.contactId ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {matchingContacts.length > 0 && (
              <optgroup label="Kontakte dieses Unternehmens">
                {matchingContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contactLabel(contact)}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={matchingContacts.length > 0 ? "Andere Kontakte" : "Alle Kontakte"}>
              {otherContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contactLabel(contact)}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Pipeline" htmlFor="pipelineId" required>
          <select
            id="pipelineId"
            name="pipelineId"
            required
            value={pipelineId}
            onChange={(event) => setPipelineId(event.target.value)}
            className={inputClass}
          >
            {pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pipeline-Stufe" htmlFor="stageId" required>
          <select
            id="stageId"
            name="stageId"
            required
            defaultValue={defaultValues?.stageId ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {selectedPipeline?.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Interesse" htmlFor="interest">
          <select
            id="interest"
            name="interest"
            defaultValue={defaultValues?.interest ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {Object.entries(POTENTIAL_NEED_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quelle" htmlFor="source">
          <select
            id="source"
            name="source"
            defaultValue={defaultValues?.source ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Priorität" htmlFor="priority">
          <select
            id="priority"
            name="priority"
            defaultValue={defaultValues?.priority ?? "NORMAL"}
            className={inputClass}
          >
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Erwarteter Wert (€)" htmlFor="expectedValueCents">
          <input
            id="expectedValueCents"
            name="expectedValueCents"
            type="text"
            inputMode="decimal"
            placeholder="15000"
            defaultValue={defaultValues?.expectedValueEuro ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Verantwortlicher" htmlFor="assignedUserId">
          <select
            id="assignedUserId"
            name="assignedUserId"
            defaultValue={defaultValues?.assignedUserId ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Nächster Follow-up" htmlFor="nextFollowUpAt">
        <input
          id="nextFollowUpAt"
          name="nextFollowUpAt"
          type="datetime-local"
          defaultValue={defaultValues?.nextFollowUpAtLocal ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Beschreibung" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaultValues?.description ?? ""}
          className={inputClass}
        />
      </Field>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern"}
        </Button>
        <Link href={defaultValues?.id ? `/leads/${defaultValues.id}` : "/leads"}>
          <Button type="button" variant="secondary">
            Abbrechen
          </Button>
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-secondary">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
