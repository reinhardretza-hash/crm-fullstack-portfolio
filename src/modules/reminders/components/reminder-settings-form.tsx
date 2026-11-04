"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateReminderSettingsAction, type ReminderSettingsState } from "../actions";

type Values = {
  quoteEnabled: boolean;
  quoteDays: number;
  dealEnabled: boolean;
  dealDays: number;
  followUpEnabled: boolean;
  taskEnabled: boolean;
  invoiceEnabled: boolean;
};

const initialState: ReminderSettingsState = { error: null };
const numberClass =
  "w-20 rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]";

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-black">
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="h-4 w-4 accent-black"
      />
      {label}
    </label>
  );
}

export function ReminderSettingsForm({ values }: { values: Values }) {
  const [state, formAction, isPending] = useActionState(updateReminderSettingsAction, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Angebote</legend>
        <Check name="quoteEnabled" label="Angebote erinnern" checked={values.quoteEnabled} />
        <label className="flex flex-wrap items-center gap-2 pl-6 text-sm text-secondary">
          Nach
          <input
            type="number"
            name="quoteDays"
            min={1}
            max={365}
            defaultValue={values.quoteDays}
            className={numberClass}
          />
          Tagen erinnern
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Deals</legend>
        <Check
          name="dealEnabled"
          label="Deals ohne Aktivität erinnern"
          checked={values.dealEnabled}
        />
        <label className="flex flex-wrap items-center gap-2 pl-6 text-sm text-secondary">
          Nach
          <input
            type="number"
            name="dealDays"
            min={1}
            max={365}
            defaultValue={values.dealDays}
            className={numberClass}
          />
          Tagen ohne Aktivität erinnern
        </label>
      </fieldset>
      <Check name="followUpEnabled" label="Follow-ups erinnern" checked={values.followUpEnabled} />
      <Check
        name="taskEnabled"
        label="Überfällige Aufgaben erinnern"
        checked={values.taskEnabled}
      />
      <Check
        name="invoiceEnabled"
        label="Überfällige Rechnungen erinnern"
        checked={values.invoiceEnabled}
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-secondary">
          Gespeichert.
        </p>
      )}
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
