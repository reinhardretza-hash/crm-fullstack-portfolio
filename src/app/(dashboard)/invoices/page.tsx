import Link from "next/link";
import { Suspense } from "react";
import { invoiceFormOptions, listInvoices } from "@/modules/invoices/queries";
import { invoiceFiltersSchema } from "@/validations/invoice";
import { INVOICE_STATUS_LABELS, effectiveInvoiceStatus } from "@/modules/invoices/helpers";
import { formatCentsAsEuro } from "@/lib/money";
import { parsePaginationParams } from "@/lib/pagination";
import { PaginationControls } from "@/components/filters/pagination-controls";
export const metadata = { title: "Rechnungen – RDEvolution CRM" };
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    values = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    );
  const parsed = invoiceFiltersSchema.safeParse(values),
    filters = parsed.success ? parsed.data : invoiceFiltersSchema.parse({}),
    pagination = parsePaginationParams(raw);
  const [{ invoices, totalCount, totalPages }, options] = await Promise.all([
    listInvoices(filters, pagination),
    invoiceFormOptions(true),
  ]);
  const cls =
    "block w-full max-w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm";
  const date = (v: Date) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "short" }).format(v);
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Rechnungen</h2>
        <Link href="/invoices/new" className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm">
          Rechnung erstellen
        </Link>
      </div>
      {!parsed.success && (
        <p role="alert" className="text-sm text-red-700">
          Ungültige Filter. Bitte die Auswahl korrigieren.
        </p>
      )}
      {raw.deleted === "1" && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Rechnung gelöscht. Historische Verknüpfungen bleiben erhalten.
        </p>
      )}
      <form method="get" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 text-xs">
          Suche
          <input
            className={cls}
            name="q"
            maxLength={200}
            defaultValue={values.q}
            placeholder="Nummer, Unternehmen, Kontakt, Angebotsnummer"
          />
        </label>
        <label className="min-w-0 text-xs">
          Status
          <select className={cls} name="status" defaultValue={filters.status || ""}>
            <option value="">Alle</option>
            {Object.entries(INVOICE_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs">
          Verantwortlicher
          <select className={cls} name="userId" defaultValue={filters.userId || ""}>
            <option value="">Alle</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs">
          Unternehmen
          <select className={cls} name="companyId" defaultValue={filters.companyId || ""}>
            <option value="">Alle</option>
            {options.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Rechnungsdatum von
          <input className={cls} name="dateFrom" type="date" defaultValue={values.dateFrom} />
        </label>
        <label className="text-xs">
          Rechnungsdatum bis
          <input className={cls} name="dateTo" type="date" defaultValue={values.dateTo} />
        </label>
        <label className="text-xs">
          Fällig von
          <input className={cls} name="dueFrom" type="date" defaultValue={values.dueFrom} />
        </label>
        <label className="text-xs">
          Fällig bis
          <input className={cls} name="dueTo" type="date" defaultValue={values.dueTo} />
        </label>
        <label className="text-xs">
          Überfällig
          <select className={cls} name="overdue" defaultValue={filters.overdue || ""}>
            <option value="">Alle</option>
            <option value="no">Nicht überfällig</option>
            <option value="yes">Überfällig</option>
          </select>
        </label>
        <label className="text-xs">
          Sortierung
          <select className={cls} name="sort" defaultValue={filters.sort}>
            <option value="updated">Aktualisiert</option>
            <option value="number">Rechnungsnummer</option>
            <option value="total">Brutto</option>
            <option value="dueDate">Fälligkeit</option>
          </select>
        </label>
        <label className="text-xs">
          Richtung
          <select className={cls} name="direction" defaultValue={filters.direction}>
            <option value="desc">Absteigend</option>
            <option value="asc">Aufsteigend</option>
          </select>
        </label>
        <button className="self-end rounded-md border border-black/15 px-3 py-2 text-sm">
          Filtern
        </button>
        <Link href="/invoices" className="self-end py-2 text-sm underline">
          Zurücksetzen
        </Link>
      </form>
      <div className="min-w-0 overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-black/5">
            <tr>
              {[
                "Rechnungsnummer",
                "Unternehmen",
                "Kontakt",
                "Angebot",
                "Status",
                "Netto",
                "Brutto",
                "Fällig am",
                "Verantwortlicher",
                "Rechnungsdatum",
              ].map((label) => (
                <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((q) => (
              <tr key={q.id} className="border-t border-black/10">
                <td className="whitespace-nowrap px-3 py-3">
                  <Link href={`/invoices/${q.id}`} className="font-medium underline">
                    {q.invoiceNumber}
                  </Link>
                </td>
                <td className="px-3 py-3">{q.company.name}</td>
                <td className="px-3 py-3">
                  {[q.contact?.firstName, q.contact?.lastName].filter(Boolean).join(" ") || "–"}
                </td>
                <td className="px-3 py-3">{q.quote?.quoteNumber || "–"}</td>
                <td className="px-3 py-3">{INVOICE_STATUS_LABELS[effectiveInvoiceStatus(q)]}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  {formatCentsAsEuro(q.subtotalCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{formatCentsAsEuro(q.totalCents)}</td>
                <td className="px-3 py-3">{date(q.dueDate)}</td>
                <td className="px-3 py-3">
                  {q.assignedUser.firstName} {q.assignedUser.lastName}
                </td>
                <td className="px-3 py-3">{date(q.issueDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {invoices.length === 0 && (
          <p className="p-5 text-sm text-muted">Keine Rechnungen gefunden.</p>
        )}
      </div>
      <Suspense>
        <PaginationControls {...pagination} totalCount={totalCount} totalPages={totalPages} />
      </Suspense>
    </div>
  );
}
