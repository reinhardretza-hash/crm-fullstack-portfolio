"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { addNoteAction, type NoteActionState } from "../actions";

type NoteFormProps = {
  companyId?: string;
  contactId?: string;
  leadId?: string;
  dealId?: string;
};

const initialState: NoteActionState = { error: null };

export function NoteForm({ companyId, contactId, leadId, dealId }: NoteFormProps) {
  const [state, formAction, isPending] = useActionState(addNoteAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {contactId && <input type="hidden" name="contactId" value={contactId} />}
      {leadId && <input type="hidden" name="leadId" value={leadId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      <textarea
        name="content"
        rows={3}
        required
        placeholder="Notiz hinzufügen..."
        className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Notiz hinzufügen"}
        </Button>
      </div>
    </form>
  );
}
