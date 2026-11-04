"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DuplicateWarning } from "@/components/ui/duplicate-warning";
import { TagInput } from "@/components/ui/tag-input";
import {
  COMPANY_SIZE_LABELS,
  COMPANY_STATUS_LABELS,
  POTENTIAL_NEED_LABELS,
  SOURCE_LABELS,
} from "@/lib/crm-labels";
import type { CompanyActionState } from "../actions";
import { checkCompanyDuplicatesAction } from "../duplicate-check-action";
import type { CompanyDuplicateMatch } from "../duplicate-detection";

type CompanyFormProps = {
  action: (state: CompanyActionState, formData: FormData) => Promise<CompanyActionState>;
  users: { id: string; firstName: string; lastName: string }[];
  defaultValues?: {
    id?: string;
    name: string;
    website: string | null;
    industry: string | null;
    phone: string | null;
    email: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    employeeCount: number | null;
    companySize: string | null;
    description: string | null;
    status: string;
    source: string | null;
    assignedUserId: string | null;
    needs: string[];
    tags: string[];
  };
};

const initialState: CompanyActionState = { error: null };

function formatDuplicateLabel(match: CompanyDuplicateMatch): string {
  const reason =
    match.matchType === "website"
      ? "gleiche Website"
      : match.matchType === "email"
        ? "gleiche E-Mail"
        : "gleicher Name + Ort";
  return `${match.name}${match.city ? ` (${match.city})` : ""} – ${reason}`;
}

export function CompanyForm({ action, users, defaultValues }: CompanyFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [duplicates, setDuplicates] = useState<CompanyDuplicateMatch[]>([]);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [website, setWebsite] = useState(defaultValues?.website ?? "");
  const [email, setEmail] = useState(defaultValues?.email ?? "");
  const [city, setCity] = useState(defaultValues?.city ?? "");

  async function runDuplicateCheck() {
    if (!name.trim()) {
      setDuplicates([]);
      return;
    }
    const matches = await checkCompanyDuplicatesAction({
      name,
      website: website || undefined,
      email: email || undefined,
      city: city || undefined,
      excludeId: defaultValues?.id,
    });
    setDuplicates(matches);
  }

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <DuplicateWarning
        title="Mögliches Duplikat gefunden – bitte prüfen, bevor du fortfährst:"
        items={duplicates.map(formatDuplicateLabel)}
      />

      <Field label="Firmenname" htmlFor="name" required>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={runDuplicateCheck}
          className={inputClass}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Website" htmlFor="website">
          <input
            id="website"
            name="website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            onBlur={runDuplicateCheck}
            placeholder="example.de"
            className={inputClass}
          />
        </Field>
        <Field label="Branche" htmlFor="industry">
          <input
            id="industry"
            name="industry"
            defaultValue={defaultValues?.industry ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Telefon" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            defaultValue={defaultValues?.phone ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="E-Mail" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onBlur={runDuplicateCheck}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Straße" htmlFor="street">
          <input
            id="street"
            name="street"
            defaultValue={defaultValues?.street ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="PLZ" htmlFor="postalCode">
          <input
            id="postalCode"
            name="postalCode"
            defaultValue={defaultValues?.postalCode ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Ort" htmlFor="city">
          <input
            id="city"
            name="city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            onBlur={runDuplicateCheck}
            className={inputClass}
          />
        </Field>
        <Field label="Land" htmlFor="country">
          <input
            id="country"
            name="country"
            defaultValue={defaultValues?.country ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field label="Mitarbeiterzahl" htmlFor="employeeCount">
          <input
            id="employeeCount"
            name="employeeCount"
            type="number"
            min={0}
            defaultValue={defaultValues?.employeeCount ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Größe" htmlFor="companySize">
          <select
            id="companySize"
            name="companySize"
            defaultValue={defaultValues?.companySize ?? ""}
            className={inputClass}
          >
            <option value="">–</option>
            {Object.entries(COMPANY_SIZE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={defaultValues?.status ?? "PROSPECT"}
            className={inputClass}
          >
            {Object.entries(COMPANY_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium text-secondary">Potenzieller Bedarf</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(POTENTIAL_NEED_LABELS).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-black/80">
              <input
                type="checkbox"
                name="needs"
                value={value}
                defaultChecked={defaultValues?.needs.includes(value)}
                className="h-4 w-4 rounded border-black/25"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <TagInput name="tags" defaultTags={defaultValues?.tags} />

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
        <Link href={defaultValues?.id ? `/companies/${defaultValues.id}` : "/companies"}>
          <Button type="button" variant="secondary">
            Abbrechen
          </Button>
        </Link>
      </div>
    </form>
  );
}

const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

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
