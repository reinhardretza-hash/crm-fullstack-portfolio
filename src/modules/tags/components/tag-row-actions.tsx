"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { deleteTagAction, renameTagAction, type TagActionState } from "../admin-actions";

type TagRowActionsProps = {
  tagId: string;
  currentName: string;
};

const initialRenameState: TagActionState = { error: null };

export function TagRowActions({ tagId, currentName }: TagRowActionsProps) {
  const router = useRouter();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const renameAction = renameTagAction.bind(null, tagId);
  const [renameState, formAction, isRenamePending] = useActionState(renameAction, initialRenameState);

  function handleDelete() {
    if (!window.confirm(`Tag "${currentName}" wirklich löschen? Die Zuordnungen zu Unternehmen/Kontakten gehen verloren.`)) {
      return;
    }
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteTagAction(tagId);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (isRenaming) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <input
          name="name"
          required
          defaultValue={currentName}
          autoFocus
          className="rounded-md border border-black/15 bg-white px-2 py-1 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
        <Button type="submit" variant="secondary" disabled={isRenamePending}>
          Speichern
        </Button>
        <button
          type="button"
          onClick={() => setIsRenaming(false)}
          className="text-xs text-muted hover:underline"
        >
          Abbrechen
        </button>
        {renameState.error && (
          <p role="alert" className="text-xs text-red-600">
            {renameState.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setIsRenaming(true)} className="text-xs text-secondary hover:underline">
        Umbenennen
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleDelete}
        className="text-xs text-red-700 hover:underline disabled:opacity-50"
      >
        Löschen
      </button>
      {deleteError && (
        <p role="alert" className="text-xs text-red-600">
          {deleteError}
        </p>
      )}
    </div>
  );
}
