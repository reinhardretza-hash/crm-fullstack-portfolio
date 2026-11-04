import Link from "next/link";
import { Suspense } from "react";
import { quoteFormOptions, listQuotes } from "@/modules/quotes/queries";
import { quoteFiltersSchema } from "@/validations/quote";
import { QUOTE_STATUS_LABELS, effectiveQuoteStatus } from "@/modules/quotes/helpers";
import { formatCentsAsEuro } from "@/lib/money";
import { parsePaginationParams } from "@/lib/pagination";
import { PaginationControls } from "@/components/filters/pagination-controls";
export const metadata = { title: "Angebote – RDEvolution CRM" };
export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams,
    values = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
    );
  const parsed = quoteFiltersSchema.safeParse(values),
    filters = parsed.success ? parsed.data : quoteFiltersSchema.parse({}),
    pagination = parsePaginationParams(raw);
  const [{ quotes, totalCount, totalPages }, options] = await Promise.all([
    listQuotes(filters, pagination),
    quoteFormOptions(true),
  ]);
  const cls =
    "block w-full max-w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm";
  const date = (v: Date) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "short" }).format(v);
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Angebote</h2>
        <Link href="/quotes/new" className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm">
          Angebot erstellen
        </Link>
      </div>
      {!parsed.success && (
        <p role="alert" className="text-sm text-red-700">
          Ungültige Filter. Bitte die Auswahl korrigieren.
        </p>
      )}
      {raw.deleted === "1" && (
        <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          Angebot gelöscht. Historische Verknüpfungen bleiben erhalten.
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
            placeholder="Nummer, Unternehmen, Kontakt, Deal"
          />
        </label>
        <label className="min-w-0 text-xs">
          Status
          <select className={cls} name="status" defaultValue={filters.status || ""}>
            <option value="">Alle</option>
            {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
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
          Angebotsdatum von
          <input className={cls} name="dateFrom" type="date" defaultValue={values.dateFrom} />
        </label>
        <label className="text-xs">
          Angebotsdatum bis
          <input className={cls} name="dateTo" type="date" defaultValue={values.dateTo} />
        </label>
        <label className="text-xs">
          Gültigkeit
          <select className={cls} name="validity" defaultValue={filters.validity || ""}>
            <option value="">Alle</option>
            <option value="valid">Noch gültig</option>
            <option value="expired">Gültigkeit überschritten</option>
          </select>
        </label>
        <label className="text-xs">
          Sortierung
          <select className={cls} name="sort" defaultValue={filters.sort}>
            <option value="updated">Aktualisiert</option>
            <option value="number">Angebotsnummer</option>
            <option value="total">Brutto</option>
            <option value="validUntil">Gültig bis</option>
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
        <Link href="/quotes" className="self-end py-2 text-sm underline">
          Zurücksetzen
        </Link>
      </form>
      <div className="min-w-0 overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-black/5">
            <tr>
              {[
                "Angebotsnummer",
                "Unternehmen",
                "Kontakt",
                "Deal",
                "Status",
                "Netto",
                "Brutto",
                "Gültig bis",
                "Verantwortlicher",
                "Aktualisiert",
              ].map((label) => (
                <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-black/10">
                <td className="whitespace-nowrap px-3 py-3">
                  <Link href={`/quotes/${q.id}`} className="font-medium underline">
                    {q.quoteNumber}
                  </Link>
                </td>
                <td className="px-3 py-3">{q.company.name}</td>
                <td className="px-3 py-3">
                  {[q.contact?.firstName, q.contact?.lastName].filter(Boolean).join(" ") || "–"}
                </td>
                <td className="px-3 py-3">{q.deal?.name || "–"}</td>
                <td className="px-3 py-3">{QUOTE_STATUS_LABELS[effectiveQuoteStatus(q)]}</td>
                <td className="whitespace-nowrap px-3 py-3">
                  {formatCentsAsEuro(q.subtotalCents)}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{formatCentsAsEuro(q.totalCents)}</td>
                <td className="px-3 py-3">{date(q.validUntil)}</td>
                <td className="px-3 py-3">
                  {q.assignedUser.firstName} {q.assignedUser.lastName}
                </td>
                <td className="px-3 py-3">
                  {new Intl.DateTimeFormat("de-DE", {
                    timeZone: "Europe/Berlin",
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(q.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {quotes.length === 0 && (
          <p className="p-5 text-sm text-muted">Keine Angebote gefunden.</p>
        )}
      </div>
      <Suspense>
        <PaginationControls {...pagination} totalCount={totalCount} totalPages={totalPages} />
      </Suspense>
    </div>
  );
}
