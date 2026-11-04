"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { saveEventAction } from "../actions";
import type { calendarFormOptions } from "../queries";
type Options = Awaited<ReturnType<typeof calendarFormOptions>>;
export type EventDefaults = {
  id?: string;
  version?: number;
  title?: string;
  description?: string | null;
  location?: string | null;
  assignedUserId: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  companyId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  dealId?: string | null;
  taskId?: string | null;
};
export function EventForm({ options, defaults }: { options: Options; defaults: EventDefaults }) {
  const [state, action, pending] = useActionState(saveEventAction.bind(null, defaults.id || null), {
    error: null,
  });
  const [allDay, setAllDay] = useState(!!defaults.allDay);
  const [values, setValues] = useState(defaults);
  const update = (name: Exclude<keyof EventDefaults, "id" | "version" | "allDay">, value: string) =>
    setValues((old) => ({ ...old, [name]: value }));
  const cls = "block w-full min-w-0 rounded-md border border-black/15 bg-white px-3 py-2 text-sm";
  const select = (
    name: Exclude<keyof EventDefaults, "id" | "version" | "allDay">,
    label: string,
    rows: { id: string; label: string }[],
    required = false,
  ) => (
    <label className="text-sm">
      {label}
      <select
        className={cls}
        name={name}
        value={String(values[name] || "")}
        onChange={(e) => update(name, e.target.value)}
        required={required}
      >
        <option value="">{required ? "Bitte auswählen" : "Keine Verknüpfung"}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="flex max-w-3xl flex-col gap-4"
    >
      {defaults.version && <input type="hidden" name="expectedVersion" value={defaults.version} />}
      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <label className="text-sm">
        Titel
        <input
          className={cls}
          name="title"
          value={values.title || ""}
          onChange={(e) => update("title", e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label className="text-sm">
        Beschreibung
        <textarea
          className={cls}
          name="description"
          value={values.description || ""}
          onChange={(e) => update("description", e.target.value)}
          maxLength={10000}
          rows={4}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="allDay"
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        Ganztägig
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Startdatum
          <input
            className={cls}
            name="startDate"
            type="date"
            value={values.startDate || ""}
            onChange={(e) => update("startDate", e.target.value)}
            onInput={(e) => update("startDate", e.currentTarget.value)}
            required
          />
        </label>
        <label className="text-sm">
          Enddatum
          <input
            className={cls}
            name="endDate"
            type="date"
            value={values.endDate || ""}
            onChange={(e) => update("endDate", e.target.value)}
            onInput={(e) => update("endDate", e.currentTarget.value)}
            required
          />
        </label>
        <label className="text-sm">
          Startzeit
          <input
            className={cls}
            name="startTime"
            type="time"
            value={values.startTime || ""}
            onChange={(e) => update("startTime", e.target.value)}
            onInput={(e) => update("startTime", e.currentTarget.value)}
            required={!allDay}
            disabled={allDay}
          />
        </label>
        <label className="text-sm">
          Endzeit
          <input
            className={cls}
            name="endTime"
            type="time"
            value={values.endTime || ""}
            onChange={(e) => update("endTime", e.target.value)}
            onInput={(e) => update("endTime", e.currentTarget.value)}
            required={!allDay}
            disabled={allDay}
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Zeiten gelten in Europe/Berlin. Ganztägig: Start- und Enddatum sind eingeschlossene
        Kalendertage. Überschneidungen werden nach dem Speichern als Hinweis angezeigt und
        blockieren den Termin nicht.
      </p>
      <label className="text-sm">
        Ort
        <input
          className={cls}
          name="location"
          value={values.location || ""}
          onChange={(e) => update("location", e.target.value)}
          maxLength={300}
        />
      </label>
      {select(
        "assignedUserId",
        "Verantwortlicher",
        options.users.map((u) => ({ id: u.id, label: `${u.firstName} ${u.lastName}` })),
        true,
      )}
      <fieldset className="grid grid-cols-1 gap-3 rounded-md border border-black/10 p-3 sm:grid-cols-2">
        <legend className="px-1 text-sm">CRM-Kontext und optionale Aufgabe</legend>
        {select(
          "companyId",
          "Unternehmen",
          options.companies.map((x) => ({ id: x.id, label: x.name })),
        )}
        {select(
          "contactId",
          "Kontakt",
          options.contacts.map((x) => ({
            id: x.id,
            label: [x.firstName, x.lastName].filter(Boolean).join(" ") || "Kontakt",
          })),
        )}
        {select(
          "leadId",
          "Lead",
          options.leads.map((x) => ({ id: x.id, label: x.title })),
        )}
        {select(
          "dealId",
          "Deal",
          options.deals.map((x) => ({ id: x.id, label: x.name })),
        )}
        {select(
          "taskId",
          "Aufgabe",
          options.tasks.map((x) => ({ id: x.id, label: x.title })),
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Speichern …" : "Termin speichern"}
        </button>
        <Link
          href={defaults.id ? `/calendar/${defaults.id}` : "/calendar"}
          className="text-sm underline"
        >
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
