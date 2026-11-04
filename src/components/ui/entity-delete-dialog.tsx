"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";

type DeleteState = { error: string | null };

export function EntityDeleteDialog({
  entity,
  name,
  deleteAction,
  triggerLabel = "Löschen",
  nameInTitle = false,
}: {
  entity: "Unternehmen" | "Kontakt" | "Angebot" | "Rechnung" | "Deal";
  name: string;
  triggerLabel?: string;
  nameInTitle?: boolean;
  deleteAction: (state: DeleteState, data: FormData) => Promise<DeleteState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAction, { error: null });
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <Dialog.Trigger asChild>
        <Button variant="danger">{triggerLabel}</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 text-black shadow-xl">
          <Dialog.Title className="break-words text-lg font-semibold">
            {entity}
            {nameInTitle ? ` ${name}` : ""} wirklich löschen?
          </Dialog.Title>
          {!nameInTitle && <p className="mt-3 break-words font-medium">{name}</p>}
          <Dialog.Description className="mt-3 text-sm text-black/70">
            {
              {
                Unternehmen: "Das Unternehmen",
                Kontakt: "Der Kontakt",
                Angebot: "Das Angebot",
                Rechnung: "Die Rechnung",
                Deal: "Der Deal",
              }[entity]
            }{" "}
            wird aus den aktiven CRM-Daten entfernt. Historische Verknüpfungen bleiben erhalten.
          </Dialog.Description>
          {state.error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <form action={action} className="mt-6 flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Abbrechen
              </Button>
            </Dialog.Close>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Wird gelöscht …" : `${entity} löschen`}
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
