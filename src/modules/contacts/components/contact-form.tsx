"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { DuplicateWarning } from "@/components/ui/duplicate-warning";
import { TagInput } from "@/components/ui/tag-input";
import { CONTACT_STATUS_LABELS, SOURCE_LABELS } from "@/lib/crm-labels";
import type { ContactActionState } from "../actions";
import { checkContactDuplicatesAction } from "../duplicate-check-action";
import type { ContactDuplicateMatch } from "../duplicate-detection";
import { contactDisplayName } from "../helpers";

type ContactFormProps = {
  action: (state: ContactActionState, formData: FormData) => Promise<ContactActionState>;
  users: { id: string; firstName: string; lastName: string }[];
  companies: { id: string; name: string }[];
  defaultValues?: {
    id?: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
    companyId: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    linkedinUrl: string | null;
    website: string | null;
    source: string | null;
    status: string;
    assignedUserId: string | null;
    tags: string[];
  };
};

const initialState: ContactActionState = { error: null };

function formatDuplicateLabel(match: ContactDuplicateMatch): string {
  const reason =
    match.matchType === "email"
      ? "gleiche E-Mail"
      : match.matchType === "linkedin"
        ? "gleiches LinkedIn-Profil"
        : match.matchType === "phone"
          ? "gleiche Telefonnummer"
          : "gleicher Name + Unternehmen";
  return `${contactDisplayName(match)} – ${reason}`;
}

export function ContactForm({ action, users, companies, defaultValues }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [duplicates, setDuplicates] = useState<ContactDuplicateMatch[]>([]);
  const [firstName, setFirstName] = useState(defaultValues?.firstName ?? "");
  const [lastName, setLastName] = useState(defaultValues?.lastName ?? "");
  const [email, setEmail] = useState(defaultValues?.email ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(defaultValues?.linkedinUrl ?? "");
  const [phone, setPhone] = useState(defaultValues?.phone ?? "");
  const [companyId, setCompanyId] = useState(defaultValues?.companyId ?? "");

  async function runDuplicateCheck() {
    if (!firstName.trim() && !lastName.trim() && !email.trim()) {
      setDuplicates([]);
      return;
    }
    const matches = await checkContactDuplicatesAction({
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: email || undefined,
      linkedinUrl: linkedinUrl || undefined,
      phone: phone || undefined,
      companyId: companyId || undefined,
      excludeId: defaultValues?.id,
    });
    setDuplicates(matches);
  }

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-5">
      <DuplicateWarning
        title="Möglicher doppelter Kontakt – bitte prüfen, bevor du fortfährst:"
        items={duplicates.map(formatDuplicateLabel)}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Vorname" htmlFor="firstName">
          <input
            id="firstName"
            name="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            onBlur={runDuplicateCheck}
            className={inputClass}
          />
        </Field>
        <Field label="Nachname" htmlFor="lastName">
          <input
            id="lastName"
            name="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            onBlur={runDuplicateCheck}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Position" htmlFor="jobTitle">
          <input
            id="jobTitle"
            name="jobTitle"
            defaultValue={defaultValues?.jobTitle ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Unternehmen" htmlFor="companyId">
          <select
            id="companyId"
            name="companyId"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            onBlur={runDuplicateCheck}
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
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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
        <Field label="Telefon" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            onBlur={runDuplicateCheck}
            className={inputClass}
          />
        </Field>
        <Field label="Mobil" htmlFor="mobile">
          <input
            id="mobile"
            name="mobile"
            defaultValue={defaultValues?.mobile ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="LinkedIn" htmlFor="linkedinUrl">
          <input
            id="linkedinUrl"
            name="linkedinUrl"
            value={linkedinUrl}
            onChange={(event) => setLinkedinUrl(event.target.value)}
            onBlur={runDuplicateCheck}
            placeholder="linkedin.com/in/..."
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Website" htmlFor="website">
          <input
            id="website"
            name="website"
            defaultValue={defaultValues?.website ?? ""}
            className={inputClass}
          />
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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={defaultValues?.status ?? "NEW"}
            className={inputClass}
          >
            {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
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

      <TagInput name="tags" defaultTags={defaultValues?.tags} />

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern"}
        </Button>
        <Link href={defaultValues?.id ? `/contacts/${defaultValues.id}` : "/contacts"}>
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
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-secondary">
        {label}
      </label>
      {children}
    </div>
  );
}
