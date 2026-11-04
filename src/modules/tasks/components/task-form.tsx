"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/crm-labels";
import type { TaskActionState } from "../actions";

type CompanyOption = { id: string; name: string };
type ContactOption = { id: string; firstName: string | null; lastName: string | null };
type LeadOption = { id: string; title: string };
type DealOption = { id: string; name: string };
type UserOption = { id: string; firstName: string; lastName: string };

type TargetType = "" | "company" | "contact" | "lead" | "deal";

type TaskFormProps = {
  action: (state: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  companies: CompanyOption[];
  contacts: ContactOption[];
  leads: LeadOption[];
  deals: DealOption[];
  users: UserOption[];
  defaultValues?: {
    id?: string;
    version?: number;
    title: string;
    description: string | null;
    assignedUserId: string;
    status: string;
    priority: string;
    dueDate: string;
    dueTime: string;
    reminderDate: string;
    reminderTime: string;
    targetType: TargetType;
    targetId: string;
  };
};

const initialState: TaskActionState = { error: null };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

function contactLabel(contact: ContactOption): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(Ohne Namen)";
}

export function TaskForm({
  action,
  companies,
  contacts,
  leads,
  deals,
  users,
  defaultValues,
}: TaskFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [targetType, setTargetType] = useState<TargetType>(defaultValues?.targetType ?? "");
  const [targetId, setTargetId] = useState(defaultValues?.targetId ?? "");

  const targetOptions: { value: string; label: string }[] =
    targetType === "company"
      ? companies.map((c) => ({ value: c.id, label: c.name }))
      : targetType === "contact"
        ? contacts.map((c) => ({ value: c.id, label: contactLabel(c) }))
        : targetType === "lead"
          ? leads.map((l) => ({ value: l.id, label: l.title }))
          : targetType === "deal"
            ? deals.map((d) => ({ value: d.id, label: d.name }))
            : [];

  const targetFieldName =
    targetType === "company"
      ? "companyId"
      : targetType === "contact"
        ? "contactId"
        : targetType === "lead"
          ? "leadId"
          : targetType === "deal"
            ? "dealId"
            : undefined;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      {defaultValues?.version !== undefined && (
        <input type="hidden" name="expectedVersion" value={defaultValues.version} />
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

      <Field label="Beschreibung" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={defaultValues?.description ?? ""}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Verantwortlicher" htmlFor="assignedUserId" required>
          <select
            id="assignedUserId"
            name="assignedUserId"
            required
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
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={defaultValues?.status ?? "OPEN"}
            className={inputClass}
          >
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
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
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Fällig am" htmlFor="dueDate" required>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            required
            defaultValue={defaultValues?.dueDate ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Uhrzeit (optional)" htmlFor="dueTime">
          <input
            id="dueTime"
            name="dueTime"
            type="time"
            defaultValue={defaultValues?.dueTime ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Erinnerung am (optional)" htmlFor="reminderDate">
          <input
            id="reminderDate"
            name="reminderDate"
            type="date"
            defaultValue={defaultValues?.reminderDate ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Erinnerungsuhrzeit (optional)" htmlFor="reminderTime">
          <input
            id="reminderTime"
            name="reminderTime"
            type="time"
            defaultValue={defaultValues?.reminderTime ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="CRM-Verknüpfung (optional)" htmlFor="targetType">
          <select
            id="targetType"
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as TargetType);
              setTargetId("");
            }}
            className={inputClass}
          >
            <option value="">Keine</option>
            <option value="company">Unternehmen</option>
            <option value="contact">Kontakt</option>
            <option value="lead">Lead</option>
            <option value="deal">Deal</option>
          </select>
        </Field>
        {targetType && (
          <Field label="Ziel auswählen" htmlFor="targetId" required>
            <select
              id="targetId"
              name={targetFieldName}
              required
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className={inputClass}
            >
              <option value="">–</option>
              {targetOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern"}
        </Button>
        <Link href={defaultValues?.id ? `/tasks/${defaultValues.id}` : "/tasks"}>
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
