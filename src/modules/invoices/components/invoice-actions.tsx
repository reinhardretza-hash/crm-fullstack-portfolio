"use client";
import { useActionState } from "react";
import { changeInvoiceAction } from "../actions";
import { INVOICE_TRANSITIONS, canDeleteInvoice, type InvoiceStatus } from "../helpers";
import { EntityDeleteDialog } from "@/components/ui/entity-delete-dialog";
const labels: Record<InvoiceStatus, string> = {
  DRAFT: "Als Entwurf öffnen",
  READY: "Bereit markieren",
  SENT: "Als gesendet markieren",
  PAID: "Als bezahlt markieren",
  OVERDUE: "Überfällig",
  CANCELLED: "Stornieren",
};
function StatusButton({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: InvoiceStatus;
}) {
  const [state, action, pending] = useActionState(
    changeInvoiceAction.bind(null, id, version, status),
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
export function InvoiceActions({
  id,
  version,
  status,
  number,
}: {
  id: string;
  version: number;
  status: InvoiceStatus;
  number: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <p className="w-full text-xs text-secondary">
        Stornieren bedeutet intern ungültig. Diese Funktion ersetzt keine buchhalterische
        Stornorechnung.
      </p>
      {INVOICE_TRANSITIONS[status].map((target) => (
        <StatusButton key={target} id={id} version={version} status={target} />
      ))}
      {canDeleteInvoice(status) && (
        <EntityDeleteDialog
          entity="Rechnung"
          name={number}
          nameInTitle
          triggerLabel="Rechnung löschen"
          deleteAction={changeInvoiceAction.bind(null, id, version, "DELETE")}
        />
      )}
    </div>
  );
}
