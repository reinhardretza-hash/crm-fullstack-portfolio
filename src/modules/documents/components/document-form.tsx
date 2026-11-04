"use client";
import { useActionState, useState } from "react";

import type { quoteFormOptions } from "@/modules/quotes/queries";
import { DEFAULT_QUOTE_INTRO, DEFAULT_QUOTE_CLOSING } from "@/modules/quotes/helpers";
import { Button } from "@/components/ui/button";
export type ItemDraft = {
  id?: string;
  title: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRateBasisPoints: string;
};
export type QuoteDefaults = {
  companyId: string;
  contactId?: string;
  dealId?: string;
  assignedUserId: string;
  issueDate: string;
  validUntil: string;
  taxRateBasisPoints?: string;
  introText?: string;
  closingText?: string;
  customerNote?: string;
  internalNote?: string;
  items?: ItemDraft[];
};
const inputClass =
  "w-full min-w-0 rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
const emptyItem = (): ItemDraft => ({
  title: "",
  description: "",
  quantity: "1",
  unit: "Pauschal",
  unitPrice: "0.00",
  taxRateBasisPoints: "",
});
export function DocumentForm({
  options,
  defaults,
  submitAction,
  kind = "quote",
  quoteId,
  duplicateWarning,
}: {
  options: Awaited<ReturnType<typeof quoteFormOptions>>;
  defaults: QuoteDefaults;
  submitAction: (
    state: { error: string | null },
    form: FormData,
  ) => Promise<{ error: string | null }>;
  kind?: "quote" | "invoice";
  quoteId?: string;
  duplicateWarning?: string | null;
}) {
  const [state, action, pending] = useActionState(submitAction, {
    error: null,
  });
  const [fields, setFields] = useState({
    ...defaults,
    contactId: defaults.contactId || "",
    dealId: defaults.dealId || "",
    taxRateBasisPoints: defaults.taxRateBasisPoints || "1900",
    introText: defaults.introText ?? DEFAULT_QUOTE_INTRO,
    closingText: defaults.closingText ?? DEFAULT_QUOTE_CLOSING,
    customerNote: defaults.customerNote || "",
    internalNote: defaults.internalNote || "",
  });
  const [items, setItems] = useState<ItemDraft[]>(defaults.items || [emptyItem()]);
  const change = (key: keyof typeof fields, value: string) =>
    setFields((previous) => ({ ...previous, [key]: value }));
  const itemChange = (index: number, key: keyof ItemDraft, value: string) =>
    setItems((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  const move = (index: number, delta: number) =>
    setItems((previous) => {
      const result = [...previous];
      [result[index], result[index + delta]] = [result[index + delta], result[index]];
      return result;
    });
  const dateFields = [
    ["issueDate", kind === "invoice" ? "Rechnungsdatum" : "Angebotsdatum"],
    ["validUntil", kind === "invoice" ? "Fällig am" : "Gültig bis"],
  ] as const;
  return (
    <form
      action={action}
      onReset={(e) => e.preventDefault()}
      className="flex min-w-0 max-w-4xl flex-col gap-5 text-black"
    >
      {quoteId && <input type="hidden" name="quoteId" value={quoteId} />}
      {duplicateWarning && (
        <label className="rounded-md bg-amber-50 p-3 text-sm">
          <input type="checkbox" name="confirmDuplicate" required /> {duplicateWarning} Ich
          bestätige die weitere Vollrechnung.
        </label>
      )}
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {quoteId && <input type="hidden" name="companyId" value={fields.companyId} />}
      <fieldset disabled={pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          Unternehmen
          <select
            name="companyId"
            required
            disabled={!!quoteId}
            className={inputClass}
            value={fields.companyId}
            onChange={(e) =>
              setFields({ ...fields, companyId: e.target.value, contactId: "", dealId: "" })
            }
          >
            <option value="">Bitte auswählen</option>
            {options.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Deal
          <select
            name="dealId"
            className={inputClass}
            value={fields.dealId}
            onChange={(e) => {
              const deal = options.deals.find((d) => d.id === e.target.value);
              setFields({
                ...fields,
                dealId: deal?.id || "",
                companyId: deal?.companyId || fields.companyId,
                contactId: deal?.contactId || "",
                assignedUserId:
                  deal?.assignedUserId && options.users.some((u) => u.id === deal.assignedUserId)
                    ? deal.assignedUserId
                    : fields.assignedUserId,
              });
            }}
          >
            <option value="">Ohne Deal</option>
            {options.deals
              .filter((d) => !fields.companyId || d.companyId === fields.companyId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Kontakt
          <select
            name="contactId"
            className={inputClass}
            value={fields.contactId}
            onChange={(e) => change("contactId", e.target.value)}
          >
            <option value="">Ohne Kontakt</option>
            {options.contacts
              .filter((c) => !c.companyId || c.companyId === fields.companyId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Kontakt"}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Verantwortlicher
          <select
            name="assignedUserId"
            required
            className={inputClass}
            value={fields.assignedUserId}
            onChange={(e) => change("assignedUserId", e.target.value)}
          >
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        {dateFields.map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}
            <input
              type="date"
              name={kind === "invoice" && key === "validUntil" ? "dueDate" : key}
              required
              min="1900-01-01"
              max="2200-12-31"
              className={inputClass}
              value={fields[key]}
              onChange={(e) => change(key, e.target.value)}
              onInput={(e) => change(key, e.currentTarget.value)}
            />
          </label>
        ))}
        <label className="text-sm">
          Standardsteuer
          <select
            name="taxRateBasisPoints"
            className={inputClass}
            value={fields.taxRateBasisPoints}
            onChange={(e) => change("taxRateBasisPoints", e.target.value)}
          >
            {[1900, 700, 0].map((rate) => (
              <option key={rate} value={rate}>
                {rate / 100} %
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-label={kind === "invoice" ? "Rechnungspositionen" : "Angebotspositionen"}
      >
        <h3 className="font-semibold">Positionen</h3>
        {items.map((item, index) => (
          <fieldset
            key={item.id || index}
            disabled={pending}
            className="min-w-0 rounded-lg border border-black/15 bg-white p-4"
          >
            <legend className="px-1 text-sm font-medium">Position {index + 1}</legend>
            <div className="grid min-w-0 gap-3 sm:grid-cols-4">
              <label className="text-sm sm:col-span-4">
                Titel
                <input
                  className={inputClass}
                  value={item.title}
                  onChange={(e) => itemChange(index, "title", e.target.value)}
                  required
                  maxLength={200}
                />
              </label>
              <label className="text-sm sm:col-span-4">
                Beschreibung
                <textarea
                  className={inputClass}
                  value={item.description}
                  onChange={(e) => itemChange(index, "description", e.target.value)}
                  maxLength={2000}
                  rows={2}
                />
              </label>
              <label className="text-sm">
                Menge
                <input
                  inputMode="decimal"
                  className={inputClass}
                  value={item.quantity}
                  onChange={(e) => itemChange(index, "quantity", e.target.value)}
                  required
                  maxLength={30}
                />
              </label>
              <label className="text-sm">
                Einheit
                <input
                  className={inputClass}
                  value={item.unit}
                  onChange={(e) => itemChange(index, "unit", e.target.value)}
                  required
                  maxLength={25}
                  list="quote-units"
                />
              </label>
              <label className="text-sm">
                Einzelpreis netto (EUR)
                <input
                  inputMode="decimal"
                  className={inputClass}
                  value={item.unitPrice}
                  onChange={(e) => itemChange(index, "unitPrice", e.target.value)}
                  required
                  maxLength={30}
                />
              </label>
              <label className="text-sm">
                Steuer
                <select
                  className={inputClass}
                  value={item.taxRateBasisPoints}
                  onChange={(e) => itemChange(index, "taxRateBasisPoints", e.target.value)}
                >
                  <option value="">Standardsteuer</option>
                  {[1900, 700, 0].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate / 100} %
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={index === 0 || pending}
                onClick={() => move(index, -1)}
                aria-label={`Position ${index + 1} nach oben`}
              >
                Nach oben
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={index === items.length - 1 || pending}
                onClick={() => move(index, 1)}
                aria-label={`Position ${index + 1} nach unten`}
              >
                Nach unten
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={items.length === 1 || pending}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                Entfernen
              </Button>
            </div>
          </fieldset>
        ))}
        <datalist id="quote-units">
          {["Stück", "Stunde", "Tag", "Pauschal", "Monat"].map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || items.length >= 100}
          onClick={() => setItems([...items, emptyItem()])}
        >
          Position hinzufügen
        </Button>
        <p className="text-xs text-muted">
          Mengen bis drei Nachkommastellen. Alle Summen werden beim Speichern serverseitig
          berechnet.
        </p>
      </section>
      {(
        [
          ["introText", "Einleitung"],
          ["closingText", "Abschlusstext"],
          ["customerNote", "Kundennotiz"],
          ["internalNote", "Interne Notiz (nur CRM, nicht im PDF)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="text-sm">
          {label}
          <textarea
            name={key}
            className={inputClass}
            value={fields[key]}
            onChange={(e) => change(key, e.target.value)}
            maxLength={4000}
            rows={3}
            readOnly={pending}
          />
        </label>
      ))}
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Wird gespeichert …"
          : kind === "invoice"
            ? "Rechnung speichern"
            : "Angebot speichern"}
      </Button>
    </form>
  );
}
