"use client";
import { useActionState } from "react";
import { changeEventAction } from "../actions";
import type { EventStatus } from "../helpers";
function StatusButton({
  id,
  version,
  status,
  label,
}: {
  id: string;
  version: number;
  status: EventStatus | "DELETE";
  label: string;
}) {
  const [state, action, pending] = useActionState(
    changeEventAction.bind(null, id, version, status),
    { error: null },
  );
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="rounded-md border border-black/15 px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending ? "Speichern …" : label}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function EventActions({
  id,
  version,
  status,
}: {
  id: string;
  version: number;
  status: EventStatus;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {status === "SCHEDULED" ? (
        <>
          <StatusButton id={id} version={version} status="COMPLETED" label="Abschließen" />
          <StatusButton id={id} version={version} status="CANCELLED" label="Absagen" />
        </>
      ) : (
        <StatusButton id={id} version={version} status="SCHEDULED" label="Wieder öffnen" />
      )}
      <StatusButton id={id} version={version} status="DELETE" label="Termin löschen" />
    </div>
  );
}
