"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CALL_OUTCOMES, CALL_OUTCOME_LABELS } from "@/modules/activity/catalog";
import { logCallAction, type CallLogState } from "../call-actions";

const fieldClass =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";
const initialState: CallLogState = { error: null };

export function CallLogDialog({
  target,
  canSetFollowUp = false,
}: {
  target: { companyId?: string; contactId?: string; dealId?: string };
  // Nur auf Deals mit eindeutig verknüpftem Lead.
  canSetFollowUp?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: CallLogState, formData: FormData) => {
      const result = await logCallAction(previous, formData);
      if (result.saved) setOpen(false);
      return result;
    },
    initialState,
  );

  return (
    <Dialog.Root open={open} onOpenChange={(value) => !pending && setOpen(value)}>
      <Dialog.Trigger asChild>
        <Button variant="secondary">Anruf dokumentieren</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-white p-6 text-black shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Anruf dokumentieren</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-secondary">
            Hält das Gespräch in der Historie fest. Es wird nichts angerufen.
          </Dialog.Description>
          <form action={action} className="mt-4 flex flex-col gap-4">
            {target.companyId && <input type="hidden" name="companyId" value={target.companyId} />}
            {target.contactId && <input type="hidden" name="contactId" value={target.contactId} />}
            {target.dealId && <input type="hidden" name="dealId" value={target.dealId} />}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Ergebnis
              <select name="outcome" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  Bitte wählen
                </option>
                {CALL_OUTCOMES.map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {CALL_OUTCOME_LABELS[outcome]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Notiz (optional)
              <textarea name="note" rows={3} maxLength={200} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dauer in Minuten (optional)
              <input
                type="number"
                name="durationMinutes"
                min={1}
                max={600}
                inputMode="numeric"
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nächster Schritt (optional)
              <input name="nextStep" maxLength={200} className={fieldClass} />
            </label>
            {canSetFollowUp && (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Follow-up am (optional)
                <input type="date" name="followUpDate" className={fieldClass} />
              </label>
            )}
            {state.error && (
              <p role="alert" className="text-sm text-red-700">
                {state.error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? "Speichern …" : "Anruf speichern"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
