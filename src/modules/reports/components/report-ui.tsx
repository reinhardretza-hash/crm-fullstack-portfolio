import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Schlanke, serverseitig gerenderte Charts (reines HTML/CSS) statt einer
// zusätzlichen Chart-Bibliothek: keine neue Dependency, kein Client-JS,
// Werte stehen immer als Text da (Tooltip via title, Tabelle in <details>),
// Farben nur Schwarz/Gold/Neutral.
export const NO_DATA_TEXT = "Für diesen Zeitraum liegen keine Daten vor.";

export function KpiCard({
  title,
  value,
  hint,
  emphasize,
}: {
  title: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`text-2xl font-semibold break-words ${emphasize ? "text-amber-700" : "text-black"}`}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ReportSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-black">{title}</h3>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type Series = { name: string; className: string; values: number[] };

// Gruppierte Säulen (1-2 Reihen). Reihen unterscheiden sich nicht nur durch
// Farbe: Legende mit Namen + Gold-Reihe mit Rahmen; alle Werte stehen
// zusätzlich in der aufklappbaren Datentabelle.
export function ColumnChart({
  title,
  labels,
  series,
  format,
}: {
  title: string;
  labels: string[];
  series: Series[];
  format: (value: number) => string;
}) {
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  if (max === 0) return <p className="text-sm text-muted">{NO_DATA_TEXT}</p>;
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className={`inline-block h-3 w-3 rounded-sm ${s.className}`} aria-hidden="true" />
            {s.name}
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label={`${title}: ${labels.length} Zeiträume, Höchstwert ${format(max)}`}
        className="flex h-44 items-end gap-px border-b border-black/20"
      >
        {labels.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="flex h-full min-w-0 flex-1 items-end justify-center gap-px"
            title={`${label}: ${series.map((s) => `${s.name} ${format(s.values[index])}`).join(", ")}`}
          >
            {series.map((s) => (
              <div
                key={s.name}
                className={`w-full max-w-4 rounded-t-sm ${s.className}`}
                style={{
                  height: `${(s.values[index] / max) * 100}%`,
                  minHeight: s.values[index] > 0 ? 2 : 0,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-px text-[11px] text-muted" aria-hidden="true">
        {labels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap"
          >
            {index % labelStep === 0 ? label : ""}
          </span>
        ))}
      </div>
      <details className="mt-3 text-xs text-secondary">
        <summary className="cursor-pointer">Daten als Tabelle anzeigen</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-1 pr-3 font-medium">Zeitraum</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 pr-3 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={`${label}-${index}`} className="border-t border-black/10">
                  <td className="py-1 pr-3">{label}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 pr-3 text-right">
                      {format(s.values[index])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

// Horizontale Balken mit Beschriftung und Zahl direkt am Balken.
export function BarList({
  items,
  format = (value) => String(value),
}: {
  items: { key: string; label: string; value: number }[];
  format?: (value: number) => string;
}) {
  const max = Math.max(0, ...items.map((item) => item.value));
  if (items.length === 0 || max === 0) {
    return <p className="text-sm text-muted">{NO_DATA_TEXT}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 break-words text-secondary">{item.label}</span>
            <span className="shrink-0 font-medium text-black">{format(item.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-sm bg-black/10" aria-hidden="true">
            <div
              className="h-2 rounded-sm bg-black"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DetailTable({
  caption,
  head,
  children,
  empty,
  exportHref,
}: {
  caption: string;
  head: string[];
  children: ReactNode;
  empty: boolean;
  exportHref?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{caption}</CardTitle>
        {exportHref && (
          <a href={exportHref} className="text-xs text-black underline hover:no-underline">
            CSV-Export
          </a>
        )}
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="text-sm text-muted">Keine Einträge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-left text-sm">
              <thead>
                <tr className="text-xs text-secondary">
                  {head.map((h, index) => (
                    <th
                      key={h}
                      className={`py-1 pr-3 font-medium ${index > 1 ? "text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>{children}</tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
