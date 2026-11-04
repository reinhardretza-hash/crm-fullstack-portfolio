"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveStageAction } from "../actions";

type StageMoveButtonsProps = {
  stageId: string;
  isFirst: boolean;
  isLast: boolean;
};

export function StageMoveButtons({ stageId, isFirst, isLast }: StageMoveButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function move(direction: "up" | "down") {
    setError(null);
    startTransition(async () => {
      const result = await moveStageAction({ stageId, direction });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          disabled={isPending || isFirst}
          onClick={() => move("up")}
          aria-label="Nach oben verschieben"
          className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs hover:border-[var(--gold)] disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={isPending || isLast}
          onClick={() => move("down")}
          aria-label="Nach unten verschieben"
          className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs hover:border-[var(--gold)] disabled:opacity-30"
        >
          ↓
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
