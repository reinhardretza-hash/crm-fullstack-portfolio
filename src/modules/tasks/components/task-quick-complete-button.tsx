"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeTaskAction } from "../actions";

type TaskQuickCompleteButtonProps = {
  taskId: string;
  version: number;
};

// Quick Complete aus Liste/Dashboard (siehe Vorgabe Punkt 18): ruft
// dieselbe Server Action mit Auth/OCC/Activity/AuditLog auf wie die
// Task-Detailseite - niemals eine reine Client-State-Änderung.
export function TaskQuickCompleteButton({ taskId, version }: TaskQuickCompleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await completeTaskAction({ taskId, expectedVersion: version });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="rounded-md border border-black/15 bg-white px-2.5 py-1 text-xs font-medium text-black hover:border-[var(--gold)] disabled:opacity-50"
      >
        {isPending ? "..." : "Erledigt"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
