import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/server/rbac";
import { formatCentsAsEuro } from "@/lib/money";
import { listAssignableUsers } from "@/modules/users/queries";
import { ACTIVITY_CATEGORY_LABELS } from "@/modules/activity/catalog";
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS } from "@/modules/quotes/helpers";
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS } from "@/modules/invoices/helpers";
import {
  REPORT_PERIODS,
  REPORT_PERIOD_LABELS,
  periodLabel,
  resolveReportPeriod,
} from "@/modules/reports/period";
import { pluralize } from "@/modules/reports/text";
import { getReport } from "@/modules/reports/queries";
import {
  BarList,
  ChartCard,
  ColumnChart,
  DetailTable,
  KpiCard,
  ReportSection,
} from "@/modules/reports/components/report-ui";
import { reportFiltersSchema } from "@/validations/report";

export const metadata: Metadata = {
  title: "Reports – RDEvolution CRM",
};

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "short" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

const inputClass =
  "rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]";

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requireUser();
  const raw = await searchParams;
  const period = resolveReportPeriod(raw);
  const filters = reportFiltersSchema.parse({
    userId: Array.isArray(raw.userId) ? raw.userId[0] : raw.userId,
    pipelineId: Array.isArray(raw.pipelineId) ? raw.pipelineId[0] : raw.pipelineId,
  });

  const [report, users] = await Promise.all([getReport(period, filters), listAssignableUsers()]);
  const { leads, deals, quotes, invoices, tasks, trend, activities } = report;

  const exportQuery = new URLSearchParams({ period: period.preset });
  if (period.preset === "custom") {
    exportQuery.set("from", period.fromKey);
    exportQuery.set("to", period.toKey);
  }
  if (filters.userId) exportQuery.set("userId", filters.userId);
  const exportHref = (type: string) => `/reports/export/${type}?${exportQuery.toString()}`;

  const eur = formatCentsAsEuro;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-black">Reports</h2>
        <p className="text-sm text-muted">
          Zeitraum: {REPORT_PERIOD_LABELS[period.preset]} ({periodLabel(period)}, Europe/Berlin)
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Zeitraum
          <select name="period" defaultValue={period.preset} className={inputClass}>
            {REPORT_PERIODS.map((value) => (
              <option key={value} value={value}>
                {REPORT_PERIOD_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Von (benutzerdefiniert)
          <input type="date" name="from" defaultValue={period.fromKey} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Bis (benutzerdefiniert)
          <input type="date" name="to" defaultValue={period.toKey} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">
          Benutzer
          <select name="userId" defaultValue={filters.userId ?? ""} className={inputClass}>
            <option value="">Alle Benutzer</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
        </label>
        {leads.pipelines.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-secondary">
            Pipeline (Funnel)
            <select
              name="pipelineId"
              defaultValue={filters.pipelineId ?? ""}
              className={inputClass}
            >
              <option value="">Standard-Pipeline</option>
              {leads.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          Anwenden
        </button>
      </form>
      {period.fellBack && (
        <p className="text-sm text-secondary" role="status">
          Ungültiger Zeitraum – es wird der Standardzeitraum &bdquo;
          {REPORT_PERIOD_LABELS[period.preset]}&ldquo; angezeigt.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          title="Fakturierter Umsatz"
          value={eur(invoices.summary.invoiced.cents)}
          hint={`${pluralize(invoices.summary.invoiced.count, "Rechnung", "Rechnungen")} (versendet/bezahlt/überfällig)`}
        />
        <KpiCard
          title="Bezahlter Betrag"
          value={eur(invoices.paid.cents)}
          hint={`${invoices.paid.count} im Zeitraum bezahlt`}
        />
        <KpiCard
          title="Offener Betrag (aktuell)"
          value={eur(invoices.open.cents)}
          hint={pluralize(invoices.open.count, "offene Rechnung", "offene Rechnungen")}
        />
        <KpiCard
          title="Überfälliger Betrag (aktuell)"
          value={eur(invoices.overdue.cents)}
          hint={pluralize(invoices.overdue.count, "überfällige Rechnung", "überfällige Rechnungen")}
          emphasize={invoices.overdue.count > 0}
        />
        <KpiCard
          title="Offener Pipeline-Wert (Deals)"
          value={eur(deals.open.cents)}
          hint={`${pluralize(deals.open.count, "offener Deal", "offene Deals")} (aktuell)`}
        />
        <KpiCard
          title="Gewonnener Deal-Wert"
          value={eur(deals.won.cents)}
          hint={`${deals.won.count} im Zeitraum gewonnen`}
        />
      </div>

      <ReportSection
        title="Umsatzentwicklung"
        description="Fakturiert nach Rechnungsdatum, bezahlt nach Zahlungsdatum. Stornierte Rechnungen und Entwürfe zählen nicht."
      >
        <ChartCard title="Fakturiert und bezahlt">
          <ColumnChart
            title="Umsatzentwicklung"
            labels={trend.invoiced.map((p) => p.label)}
            format={(cents) => eur(cents)}
            series={[
              {
                name: "Fakturiert",
                className: "bg-black",
                values: trend.invoiced.map((p) => p.value),
              },
              {
                name: "Bezahlt",
                className: "bg-[var(--gold)] ring-1 ring-black/40",
                values: trend.paid.map((p) => p.value),
              },
            ]}
          />
        </ChartCard>
      </ReportSection>

      <ReportSection
        title="Vertrieb: Leads und Deals"
        description="Neue Leads/Deals nach Anlagedatum; gewonnen/verloren nach Abschlussdatum; offene Werte sind der aktuelle Stand."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Neue Leads" value={String(leads.newLeads)} />
          <KpiCard title="Offene Leads (aktuell)" value={String(leads.openLeads)} />
          <KpiCard title="Neue Deals" value={String(deals.newDeals)} />
          <KpiCard
            title="Ø Deal-Wert"
            value={eur(deals.averageCents)}
            hint="Alle im Zeitraum angelegten Deals"
          />
          <KpiCard
            title="Gewonnene Deals"
            value={String(deals.won.count)}
            hint={eur(deals.won.cents)}
          />
          <KpiCard
            title="Verlorene Deals"
            value={String(deals.lost.count)}
            hint={eur(deals.lost.cents)}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title={`Funnel: offene Leads je Stufe${leads.pipelineName ? ` (${leads.pipelineName})` : ""}`}
          >
            <BarList items={leads.funnel} />
          </ChartCard>
          <ChartCard title="Deals nach Status (im Zeitraum angelegt)">
            <BarList items={deals.distribution} />
          </ChartCard>
        </div>
      </ReportSection>

      <ReportSection
        title="Angebote"
        description="Angebote nach Angebotsdatum im Zeitraum. Abgelaufen = bereit/versendet und Gültigkeit überschritten. Conversion = angenommen / (angenommen + abgelehnt)."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Erstellte Angebote" value={String(quotes.summary.created.count)} />
          <KpiCard
            title="Gesamtwert (ohne storniert)"
            value={eur(quotes.summary.valueCreatedCents)}
          />
          <KpiCard title="Angenommener Wert" value={eur(quotes.summary.acceptedCents)} />
          <KpiCard
            title="Offen (versendet, gültig)"
            value={eur(quotes.summary.openSentCents)}
            hint={
              quotes.summary.conversionRate === null
                ? "Conversion: noch keine entschiedenen Angebote"
                : `Conversion: ${quotes.summary.conversionRate.toLocaleString("de-DE")} %`
            }
          />
        </div>
        <ChartCard title="Angebote nach Status">
          <BarList
            items={QUOTE_STATUSES.map((status) => ({
              key: status,
              label: `${QUOTE_STATUS_LABELS[status]} (${eur(quotes.byStatus[status].cents)})`,
              value: quotes.byStatus[status].count,
            }))}
          />
        </ChartCard>
      </ReportSection>

      <ReportSection
        title="Rechnungen"
        description="Rechnungen nach Rechnungsdatum im Zeitraum. Überfällig = Status überfällig oder versendet mit Fälligkeit in der Vergangenheit."
      >
        <ChartCard title="Rechnungen nach Status">
          <BarList
            items={INVOICE_STATUSES.map((status) => ({
              key: status,
              label: `${INVOICE_STATUS_LABELS[status]} (${eur(invoices.byStatus[status].cents)})`,
              value: invoices.byStatus[status].count,
            }))}
          />
        </ChartCard>
      </ReportSection>

      <ReportSection title="Aufgaben und Follow-ups">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard title="Offene Aufgaben" value={String(tasks.open)} />
          <KpiCard
            title="Überfällige Aufgaben"
            value={String(tasks.overdue)}
            emphasize={tasks.overdue > 0}
          />
          <KpiCard title="Erledigt im Zeitraum" value={String(tasks.completed)} />
          <KpiCard title="Follow-ups heute fällig" value={String(leads.followUps.today)} />
          <KpiCard
            title="Follow-ups überfällig"
            value={String(leads.followUps.overdue)}
            emphasize={leads.followUps.overdue > 0}
          />
        </div>
      </ReportSection>

      <ReportSection title="Aktivitäten" description="Auf Basis des Aktivitätenmoduls.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <KpiCard title="Aktivitäten im Zeitraum" value={String(activities.total)} />
          <ChartCard title="Nach Kategorie">
            <BarList
              items={activities.byCategory.map((row) => ({
                key: row.category,
                label: ACTIVITY_CATEGORY_LABELS[row.category],
                value: row.count,
              }))}
            />
          </ChartCard>
          <ChartCard title="Nach Benutzer">
            <BarList items={activities.byUser} />
          </ChartCard>
        </div>
        <ChartCard title="Aktivitäten über Zeit">
          <ColumnChart
            title="Aktivitäten über Zeit"
            labels={trend.activities.map((p) => p.label)}
            format={(value) => String(value)}
            series={[
              {
                name: "Aktivitäten",
                className: "bg-black",
                values: trend.activities.map((p) => p.value),
              },
            ]}
          />
        </ChartCard>
        <Link href="/activities" className="text-sm text-black underline hover:no-underline">
          Alle Aktivitäten ansehen
        </Link>
      </ReportSection>

      <ReportSection
        title="Detailauswertungen"
        description={`Jeweils die ersten 10 Einträge; CSV-Export enthält den gesamten Zeitraum.`}
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <DetailTable
            caption="Gewonnene Deals im Zeitraum"
            head={["Deal", "Unternehmen", "Wert", "Abschluss"]}
            empty={deals.wonList.length === 0}
            exportHref={exportHref("deals")}
          >
            {deals.wonList.map((deal) => (
              <tr key={deal.id} className="border-t border-black/10">
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/deals/${deal.id}`}
                    className="font-medium text-black hover:underline"
                  >
                    {deal.name}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-secondary">{deal.company.name}</td>
                <td className="py-1.5 pr-3 text-right">{eur(deal.valueCents)}</td>
                <td className="py-1.5 text-right text-secondary">
                  {deal.closedAt ? DATE_TIME_FORMAT.format(deal.closedAt) : "–"}
                </td>
              </tr>
            ))}
          </DetailTable>
          <DetailTable
            caption="Überfällige Rechnungen"
            head={["Rechnung", "Unternehmen", "Betrag", "Fällig"]}
            empty={invoices.overdueList.length === 0}
            exportHref={exportHref("invoices")}
          >
            {invoices.overdueList.map((invoice) => (
              <tr key={invoice.id} className="border-t border-black/10">
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-medium text-black hover:underline"
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-secondary">{invoice.company.name}</td>
                <td className="py-1.5 pr-3 text-right">{eur(invoice.totalCents)}</td>
                <td className="py-1.5 text-right text-secondary">
                  {DATE_FORMAT.format(invoice.dueDate)}
                </td>
              </tr>
            ))}
          </DetailTable>
          <DetailTable
            caption="Offene Angebote (bereit/versendet, gültig)"
            head={["Angebot", "Unternehmen", "Wert", "Gültig bis"]}
            empty={quotes.openList.length === 0}
            exportHref={exportHref("quotes")}
          >
            {quotes.openList.map((quote) => (
              <tr key={quote.id} className="border-t border-black/10">
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/quotes/${quote.id}`}
                    className="font-medium text-black hover:underline"
                  >
                    {quote.quoteNumber}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-secondary">{quote.company.name}</td>
                <td className="py-1.5 pr-3 text-right">{eur(quote.totalCents)}</td>
                <td className="py-1.5 text-right text-secondary">
                  {DATE_FORMAT.format(quote.validUntil)}
                </td>
              </tr>
            ))}
          </DetailTable>
          <DetailTable
            caption="Überfällige Aufgaben"
            head={["Aufgabe", "Verantwortlich", "Fällig"]}
            empty={tasks.overdueList.length === 0}
          >
            {tasks.overdueList.map((task) => (
              <tr key={task.id} className="border-t border-black/10">
                <td className="py-1.5 pr-3">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium text-black hover:underline"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-secondary">
                  {task.assignedUser
                    ? `${task.assignedUser.firstName} ${task.assignedUser.lastName}`
                    : "–"}
                </td>
                <td className="py-1.5 text-right text-secondary">
                  {DATE_TIME_FORMAT.format(task.dueAt)}
                </td>
              </tr>
            ))}
          </DetailTable>
        </div>
      </ReportSection>
    </div>
  );
}
