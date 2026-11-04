"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { adminSetPasswordAction, type UserActionState } from "../actions";

type SetPasswordFormProps = {
  userId: string;
};

const initialState: UserActionState = { error: null };

// Administratives Zurücksetzen: nur das neue Passwort wird erfragt, das
// alte wird nirgends angezeigt (siehe Vorgabe Punkt 8).
export function SetPasswordForm({ userId }: SetPasswordFormProps) {
  const action = adminSetPasswordAction.bind(null, userId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-secondary">
          Neues Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Speichern..." : "Neues Passwort setzen"}
        </Button>
      </div>
    </form>
  );
}
