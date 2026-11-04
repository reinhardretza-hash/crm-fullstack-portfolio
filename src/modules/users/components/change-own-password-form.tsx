"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { changeOwnPasswordAction, type ChangeOwnPasswordState } from "../actions";

const initialState: ChangeOwnPasswordState = { error: null, success: false };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

export function ChangeOwnPasswordForm() {
  const [state, formAction, isPending] = useActionState(changeOwnPasswordAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="currentPassword" className="text-xs font-medium text-secondary">
          Aktuelles Passwort
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className="text-xs font-medium text-secondary">
          Neues Passwort
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-xs font-medium text-secondary">
          Neues Passwort bestätigen
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-green-700">
          Passwort erfolgreich geändert. Andere angemeldete Sitzungen wurden ungültig.
        </p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Passwort ändern"}
        </Button>
      </div>
    </form>
  );
}
