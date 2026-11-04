"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createTagAction, type TagActionState } from "../admin-actions";

const initialState: TagActionState = { error: null };

export function TagCreateForm() {
  const [state, formAction, isPending] = useActionState(createTagAction, initialState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-xs font-medium text-secondary">
          Neuer Tag
        </label>
        <input
          id="name"
          name="name"
          required
          className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Speichern..." : "Tag erstellen"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
