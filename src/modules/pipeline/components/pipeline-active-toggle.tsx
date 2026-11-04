"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { togglePipelineActiveAction } from "../actions";

type PipelineActiveToggleProps = {
  pipelineId: string;
  isActive: boolean;
};

export function PipelineActiveToggle({ pipelineId, isActive }: PipelineActiveToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await togglePipelineActiveAction(pipelineId, !isActive);
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
        className="rounded-md border border-black/15 bg-white px-2.5 py-1 text-xs hover:border-[var(--gold)] disabled:opacity-50"
      >
        {isActive ? "Deaktivieren" : "Aktivieren"}
      </button>
      {error && (
        <p role="alert" className="max-w-[220px] text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
