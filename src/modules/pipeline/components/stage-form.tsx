"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { StageFormActionState } from "../actions";

type StageFormProps = {
  action: (state: StageFormActionState, formData: FormData) => Promise<StageFormActionState>;
  defaultValues: {
    name: string;
    probability: number | null;
    color: string | null;
    isWonStage: boolean;
    isLostStage: boolean;
    version: number;
  };
};

const initialState: StageFormActionState = { error: null };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

export function StageForm({ action, defaultValues }: StageFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5">
      <input type="hidden" name="expectedVersion" value={defaultValues.version} />

      <Field label="Name" htmlFor="name" required>
        <input id="name" name="name" required defaultValue={defaultValues.name} className={inputClass} />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Standardwahrscheinlichkeit (%)" htmlFor="probability">
          <input
            id="probability"
            name="probability"
            type="number"
            min={0}
            max={100}
            defaultValue={defaultValues.probability ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Farbe" htmlFor="color">
          <input
            id="color"
            name="color"
            type="text"
            placeholder="#RRGGBB"
            defaultValue={defaultValues.color ?? ""}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-black/80">
          <input type="checkbox" name="isWonStage" defaultChecked={defaultValues.isWonStage} />
          Gewonnen-Stufe
        </label>
        <label className="flex items-center gap-2 text-sm text-black/80">
          <input type="checkbox" name="isLostStage" defaultChecked={defaultValues.isLostStage} />
          Verloren-Stufe
        </label>
        <p className="text-xs text-muted">
          Höchstens eine Gewonnen- und eine Verloren-Stufe je Pipeline, niemals beides gleichzeitig.
        </p>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern"}
        </Button>
        <Link href="/settings/pipeline">
          <Button type="button" variant="secondary">
            Abbrechen
          </Button>
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-secondary">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
