"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { UserActionState } from "../actions";

type UserFormProps = {
  action: (state: UserActionState, formData: FormData) => Promise<UserActionState>;
  mode: "create" | "edit";
  defaultValues?: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
};

const initialState: UserActionState = { error: null };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

export function UserForm({ action, mode, defaultValues }: UserFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Vorname" htmlFor="firstName" required>
          <input
            id="firstName"
            name="firstName"
            required
            defaultValue={defaultValues?.firstName ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Nachname" htmlFor="lastName" required>
          <input
            id="lastName"
            name="lastName"
            required
            defaultValue={defaultValues?.lastName ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="E-Mail" htmlFor="email" required>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultValues?.email ?? ""}
          className={inputClass}
        />
      </Field>

      <Field label="Rolle" htmlFor="role" required>
        <select id="role" name="role" required defaultValue={defaultValues?.role ?? "USER"} className={inputClass}>
          <option value="OWNER">Owner</option>
          <option value="ADMIN">Admin</option>
          <option value="USER">Benutzer</option>
        </select>
      </Field>

      {mode === "create" && (
        <Field label="Initiales Passwort" htmlFor="password" required>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern"}
        </Button>
        <Link href="/settings/users">
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
