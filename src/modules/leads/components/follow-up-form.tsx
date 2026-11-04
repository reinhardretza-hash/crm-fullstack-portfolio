"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setLeadFollowUpAction, type LeadActionState } from "../actions";

type FollowUpFormProps = {
  leadId: string;
  currentValueLocal: string;
};

const initialState: LeadActionState = { error: null };

export function FollowUpForm({ leadId, currentValueLocal }: FollowUpFormProps) {
  const action = setLeadFollowUpAction.bind(null, leadId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="nextFollowUpAt" className="text-xs font-medium text-secondary">
          Nächster Follow-up
        </label>
        <input
          id="nextFollowUpAt"
          name="nextFollowUpAt"
          type="datetime-local"
          defaultValue={currentValueLocal}
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
        />
      </div>
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Speichern..." : "Follow-up setzen"}
      </Button>
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
