"use client";
import { useActionState } from "react";
import { changeQuoteAction } from "../actions";
import { QUOTE_TRANSITIONS, canDeleteQuote, type QuoteStatus } from "../helpers";
import { EntityDeleteDialog } from "@/components/ui/entity-delete-dialog";
const labels: Record<QuoteStatus, string> = {
  DRAFT: "Als Entwurf öffnen",
  READY: "Bereit markieren",
  SENT: "Als gesendet markieren",
  ACCEPTED: "Als angenommen markieren",
  REJECTED: "Als abgelehnt markieren",
  CANCELLED: "Stornieren",
  EXPIRED: "Abgelaufen",
};
function StatusButton({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: QuoteStatus;
}) {
  const [state, action, pending] = useActionState(
    changeQuoteAction.bind(null, id, version, status),
    { error: null },
  );
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Speichern …" : labels[status]}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function QuoteActions({
  id,
  version,
  status,
  number,
}: {
  id: string;
  version: number;
  status: QuoteStatus;
  number: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {QUOTE_TRANSITIONS[status].map((target) => (
        <StatusButton key={target} id={id} version={version} status={target} />
      ))}
      {canDeleteQuote(status) && (
        <EntityDeleteDialog
          entity="Angebot"
          name={number}
          nameInTitle
          triggerLabel="Angebot löschen"
          deleteAction={changeQuoteAction.bind(null, id, version, "DELETE")}
        />
      )}
    </div>
  );
}
