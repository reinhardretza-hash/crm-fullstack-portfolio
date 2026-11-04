"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@/generated/prisma/client";
import { completeTaskAction, deleteTaskAction, reopenTaskAction } from "../actions";

type TaskStatusActionsProps = {
  taskId: string;
  status: TaskStatus;
  version: number;
};

export function TaskStatusActions({ taskId, status, version }: TaskStatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runComplete() {
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

  function runReopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenTaskAction({ taskId, expectedVersion: version });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function runDelete() {
    setError(null);
    startTransition(async () => {
      await deleteTaskAction(taskId);
      router.push("/tasks");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status !== "COMPLETED" ? (
          <Button type="button" disabled={isPending} onClick={runComplete}>
            Als erledigt markieren
          </Button>
        ) : (
          <Button type="button" variant="secondary" disabled={isPending} onClick={runReopen}>
            Wieder öffnen
          </Button>
        )}
        <Button type="button" variant="secondary" disabled={isPending} onClick={runDelete}>
          Löschen
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
