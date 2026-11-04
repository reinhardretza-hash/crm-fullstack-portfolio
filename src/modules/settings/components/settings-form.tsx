"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateSettingsAction, type SettingsActionState } from "../actions";

type PipelineOption = { id: string; name: string };

type SettingsFormProps = {
  pipelines: PipelineOption[];
  defaultValues: {
    legalCompanyName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
    country?: string;
    vatId?: string;
    taxNumber?: string;
    iban?: string;
    bic?: string;
    bankName?: string;
    defaultPaymentTermDays?: number;
    companyName: string;
    timezone: string;
    currency: string;
    defaultPipelineId: string;
    version: number;
  };
};

const initialState: SettingsActionState = { error: null };
const inputClass =
  "rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[var(--gold)]";

export function SettingsForm({ pipelines, defaultValues }: SettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5">
      <input type="hidden" name="expectedVersion" value={defaultValues.version} />

      <Field label="Firmenname" htmlFor="companyName" required>
        <input
          id="companyName"
          name="companyName"
          required
          defaultValue={defaultValues.companyName}
          className={inputClass}
        />
      </Field>

      <Field label="Zeitzone" htmlFor="timezone" required>
        <input
          id="timezone"
          name="timezone"
          required
          defaultValue={defaultValues.timezone}
          className={inputClass}
        />
      </Field>

      <Field label="Standardwährung" htmlFor="currency" required>
        <input
          id="currency"
          name="currency"
          required
          defaultValue={defaultValues.currency}
          className={inputClass}
        />
      </Field>

      <Field label="Standard-Pipeline" htmlFor="defaultPipelineId" required>
        <select
          id="defaultPipelineId"
          name="defaultPipelineId"
          required
          defaultValue={defaultValues.defaultPipelineId}
          className={inputClass}
        >
          {pipelines.map((pipeline) => (
            <option key={pipeline.id} value={pipeline.id}>
              {pipeline.name}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-medium text-black">Rechnungs-Aussteller und Zahlung</legend>
        <p className="text-xs text-secondary">
          Nur tatsächliche Unternehmensdaten eintragen. Ohne Anschrift und Steuerkennung
          kennzeichnet das PDF den Entwicklungsstand; Rechtskonformität wird nicht bestätigt.
        </p>
        {[
          ["legalCompanyName", "Rechtlicher Firmenname"],
          ["street", "Straße"],
          ["postalCode", "Postleitzahl"],
          ["city", "Ort"],
          ["country", "Land"],
          ["vatId", "USt-IdNr."],
          ["taxNumber", "Steuernummer"],
          ["iban", "IBAN"],
          ["bic", "BIC"],
          ["bankName", "Bankname"],
        ].map(([key, label]) => (
          <Field key={key} label={label} htmlFor={key}>
            <input
              id={key}
              name={key}
              maxLength={200}
              defaultValue={defaultValues[key as keyof typeof defaultValues] || ""}
              className={inputClass}
            />
          </Field>
        ))}
        <Field label="Standard-Zahlungsziel (Tage)" htmlFor="defaultPaymentTermDays">
          <input
            id="defaultPaymentTermDays"
            name="defaultPaymentTermDays"
            type="number"
            min={0}
            max={365}
            required
            defaultValue={defaultValues.defaultPaymentTermDays ?? 14}
            className={inputClass}
          />
        </Field>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : "Speichern"}
        </Button>
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
