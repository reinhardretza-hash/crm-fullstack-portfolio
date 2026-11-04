"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setUserActiveAction } from "../actions";

type UserStatusToggleProps = {
  userId: string;
  isActive: boolean;
};

// Aktivieren/Deaktivieren über eine echte Server Action (Auth + OWNER-
// Schutz + AuditLog, siehe owner-guard.ts) - niemals eine reine
// Client-State-Änderung.
export function UserStatusToggle({ userId, isActive }: UserStatusToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await setUserActiveAction(userId, !isActive);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="secondary" disabled={isPending} onClick={handleClick}>
        {isActive ? "Deaktivieren" : "Aktivieren"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
