"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteStageAction } from "../actions";

type StageDeleteButtonProps = {
  stageId: string;
  stageName: string;
};

export function StageDeleteButton({ stageId, stageName }: StageDeleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(`Pipeline-Stufe "${stageName}" wirklich löschen?`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteStageAction(stageId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="rounded-md border border-black/15 bg-white px-2.5 py-1 text-xs text-red-700 hover:border-red-300 disabled:opacity-50"
      >
        Löschen
      </button>
      {error && (
        <p role="alert" className="max-w-[200px] text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
