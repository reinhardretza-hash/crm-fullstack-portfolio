"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { deleteFileAction } from "../actions";

export function FileDeleteButton({ fileId, name }: { fileId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setPending(true);
    setError(null);
    const result = await deleteFileAction(fileId);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="text-xs text-red-700 underline hover:no-underline"
          aria-label={`Datei ${name} löschen`}
        >
          Löschen
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 text-black shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Datei wirklich löschen?</Dialog.Title>
          <p className="mt-3 font-medium break-all">{name}</p>
          <Dialog.Description className="mt-3 text-sm text-black/70">
            Die Datei wird entfernt und kann nicht wiederhergestellt werden.
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" disabled={pending}>
                Abbrechen
              </Button>
            </Dialog.Close>
            <Button type="button" variant="danger" disabled={pending} onClick={confirmDelete}>
              {pending ? "Wird gelöscht …" : "Datei löschen"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
