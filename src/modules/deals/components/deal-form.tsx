"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { POTENTIAL_NEED_LABELS } from "@/lib/crm-labels";
import type { DealActionState } from "../actions";

type CompanyOption = { id: string; name: string };
type ContactOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyId: string | null;
};
type LeadOption = { id: string; title: string };
type UserOption = { id: string; firstName: string; lastName: string };

type DealFormProps = {
  action: (state: DealActionState, formData: FormData) => Promise<DealActionState>;
  companies: CompanyOption[];
  contacts: ContactOption[];
  leads: LeadOption[];
  users: UserOption[];
  defaultValues?: {
    id?: string;
    version?: number;
    name: string;
    companyId: string;
    contactId: string | null;
    leadId: string | null;
    assignedUserId: string | null;
    service: string;
    valueEuro: string;
    probability: number | null;
    expectedCloseDateLocal: string;
    description: string | null;
  };
};

const initialState: DealActionState = { error: null };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

function contactLabel(contact: ContactOption): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(Ohne Namen)";
}

export function DealForm({
  action,
  companies,
  contacts,
  leads,
  users,
  defaultValues,
}: DealFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [companyId, setCompanyId] = useState(defaultValues?.companyId ?? "");

  // Bevorzugt Kontakte des gewählten Unternehmens, blockiert andere aber
  // nicht (gleiches Muster wie beim Lead-Formular).
  const { matchingContacts, otherContacts } = useMemo(() => {
    if (!companyId) return { matchingContacts: [], otherContacts: contacts };
    return {
      matchingContacts: contacts.filter((c) => c.companyId === companyId),
      otherContacts: contacts.filter((c) => c.companyId !== companyId),
    };
  }, [contacts, companyId]);

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {defaultValues?.version !== undefined && (
        <input type="hidden" name="expectedVersion" value={defaultValues.version} />
      )}

      <Field label="Name" htmlFor="name" required>
        <input
          id="name"
          name="name"
          required
          defaultValue={defaultValues?.name ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Unternehmen" htmlFor="companyId" required>
          <select
            id="companyId"
            name="companyId"
            required
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
        <Field label="Leistung" htmlFor="service" required>
          <select
            id="service"
            name="service"
            required
            defaultValue={defaultValues?.service ?? ""}
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
        <Field label="Lead" htmlFor="leadId">
          <select
            id="leadId"
            name="leadId"
            defaultValue={defaultValues?.leadId ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.title}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Wert (€)" htmlFor="valueCents" required>
          <input
            id="valueCents"
            name="valueCents"
            type="text"
            inputMode="decimal"
            required
            placeholder="15000"
            defaultValue={defaultValues?.valueEuro ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Wahrscheinlichkeit (%)" htmlFor="probability">
          <input
            id="probability"
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={defaultValues?.probability ?? ""}
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

      <Field label="Erwarteter Abschluss" htmlFor="expectedCloseDate">
        <input
          id="expectedCloseDate"
          name="expectedCloseDate"
          type="date"
          defaultValue={defaultValues?.expectedCloseDateLocal ?? ""}
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
        <Link href={defaultValues?.id ? `/deals/${defaultValues.id}` : "/deals"}>
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
