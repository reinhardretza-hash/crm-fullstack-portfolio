"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DEAL_LOST_REASON_LABELS } from "@/lib/crm-labels";
import type { DealLostReason, DealStatus } from "@/generated/prisma/client";
import { markDealLostAction, markDealWonAction, reopenDealAction } from "../actions";

type DealStatusActionsProps = {
  dealId: string;
  status: DealStatus;
  version: number;
};

const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

export function DealStatusActions({ dealId, status, version }: DealStatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState<DealLostReason | "">("");
  const [lostReasonNote, setLostReasonNote] = useState("");

  function runWon() {
    setError(null);
    startTransition(async () => {
      const result = await markDealWonAction({ dealId, expectedVersion: version });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function runLost() {
    setError(null);
    startTransition(async () => {
      const result = await markDealLostAction({
        dealId,
        expectedVersion: version,
        lostReason: lostReason || undefined,
        lostReasonNote: lostReasonNote || undefined,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setShowLostForm(false);
      router.refresh();
    });
  }

  function runReopen() {
    setError(null);
    startTransition(async () => {
      const result = await reopenDealAction({ dealId, expectedVersion: version });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" && (
          <>
            <Button type="button" disabled={isPending} onClick={runWon}>
              Gewonnen markieren
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() => setShowLostForm((v) => !v)}
            >
              Verloren markieren
            </Button>
          </>
        )}
        {status !== "OPEN" && (
          <Button type="button" variant="secondary" disabled={isPending} onClick={runReopen}>
            Wieder öffnen
          </Button>
        )}
      </div>

      {showLostForm && status === "OPEN" && (
        <div className="flex flex-col gap-2 rounded-md border border-black/10 p-3">
          <label htmlFor="lostReason" className="text-xs font-medium text-secondary">
            Grund (optional)
          </label>
          <select
            id="lostReason"
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value as DealLostReason | "")}
            className={inputClass}
          >
            <option value="">–</option>
            {Object.entries(DEAL_LOST_REASON_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {lostReason === "OTHER" && (
            <input
              value={lostReasonNote}
              onChange={(event) => setLostReasonNote(event.target.value)}
              placeholder="Zusätzlicher Hinweis..."
              className={inputClass}
            />
          )}
          <div>
            <Button type="button" disabled={isPending} onClick={runLost}>
              {isPending ? "Speichern..." : "Als verloren bestätigen"}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
