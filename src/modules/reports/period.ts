import {
  addCalendarDays,
  berlinDayRangeUtc,
  dateKeyInTimeZone,
  isCalendarDate,
} from "@/lib/timezone";

// Zeitraum-Logik für Reports: reine Funktionen, Europe/Berlin-Kalendertage.
// "von"/"bis" sind inklusive Kalendertage; die UTC-Grenzen werden über den
// bestehenden berlinDayRangeUtc-Helper gebildet (Sommer-/Winterzeit-sicher).
export const REPORT_PERIODS = ["today", "7d", "30d", "quarter", "year", "custom"] as const;
export type ReportPeriodPreset = (typeof REPORT_PERIODS)[number];

export const REPORT_PERIOD_LABELS: Record<ReportPeriodPreset, string> = {
  today: "Heute",
  "7d": "Letzte 7 Tage",
  "30d": "Letzte 30 Tage",
  quarter: "Dieses Quartal",
  year: "Dieses Jahr",
  custom: "Benutzerdefiniert",
};

export type ReportGranularity = "day" | "week" | "month";

export type ReportPeriod = {
  preset: ReportPeriodPreset;
  fromKey: string;
  toKey: string;
  start: Date;
  end: Date;
  granularity: ReportGranularity;
  // true, wenn übergebene URL-Parameter ungültig waren und auf den Standard
  // zurückgefallen wurde.
  fellBack: boolean;
};

export const DEFAULT_REPORT_PERIOD: ReportPeriodPreset = "30d";
const MAX_RANGE_DAYS = 3660;

export function daysBetween(fromKey: string, toKey: string): number {
  const ms = Date.parse(`${toKey}T12:00:00Z`) - Date.parse(`${fromKey}T12:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function granularityForDays(days: number): ReportGranularity {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function presetRange(preset: Exclude<ReportPeriodPreset, "custom">, todayKey: string) {
  switch (preset) {
    case "today":
      return { fromKey: todayKey, toKey: todayKey };
    case "7d":
      return { fromKey: addCalendarDays(todayKey, -6), toKey: todayKey };
    case "30d":
      return { fromKey: addCalendarDays(todayKey, -29), toKey: todayKey };
    case "quarter": {
      const [year, month] = todayKey.split("-").map(Number);
      const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return {
        fromKey: `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`,
        toKey: todayKey,
      };
    }
    case "year":
      return { fromKey: `${todayKey.slice(0, 4)}-01-01`, toKey: todayKey };
  }
}

function build(
  preset: ReportPeriodPreset,
  fromKey: string,
  toKey: string,
  fellBack: boolean,
): ReportPeriod {
  return {
    preset,
    fromKey,
    toKey,
    start: berlinDayRangeUtc(new Date(`${fromKey}T12:00:00Z`)).start,
    end: berlinDayRangeUtc(new Date(`${toKey}T12:00:00Z`)).end,
    granularity: granularityForDays(daysBetween(fromKey, toKey)),
    fellBack,
  };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Validiert URL-Parameter serverseitig; ungültige Werte fallen auf den
// Standardzeitraum zurück (nie ungeprüft übernommen).
export function resolveReportPeriod(
  raw: { period?: string | string[]; from?: string | string[]; to?: string | string[] },
  now: Date = new Date(),
): ReportPeriod {
  const todayKey = dateKeyInTimeZone(now);
  const requested = first(raw.period);
  const preset = (REPORT_PERIODS as readonly string[]).includes(requested ?? "")
    ? (requested as ReportPeriodPreset)
    : undefined;

  if (preset && preset !== "custom") {
    const range = presetRange(preset, todayKey);
    return build(preset, range.fromKey, range.toKey, false);
  }

  const from = first(raw.from);
  const to = first(raw.to);
  if (
    preset === "custom" &&
    from &&
    to &&
    isCalendarDate(from) &&
    isCalendarDate(to) &&
    from <= to &&
    daysBetween(from, to) <= MAX_RANGE_DAYS
  ) {
    return build("custom", from, to, false);
  }

  const range = presetRange(DEFAULT_REPORT_PERIOD as "30d", todayKey);
  // fellBack nur melden, wenn überhaupt etwas Ungültiges übergeben wurde.
  const hadInput = requested !== undefined || from !== undefined || to !== undefined;
  return build(DEFAULT_REPORT_PERIOD, range.fromKey, range.toKey, hadInput);
}

// --- Gruppierung (Buckets). Wochen beginnen Montag (wie PostgreSQL date_trunc).
export function bucketKeyOf(dateKey: string, granularity: ReportGranularity): string {
  if (granularity === "day") return dateKey;
  if (granularity === "month") return `${dateKey.slice(0, 7)}-01`;
  const weekday = new Date(`${dateKey}T12:00:00Z`).getUTCDay(); // 0 = Sonntag
  return addCalendarDays(dateKey, -((weekday + 6) % 7));
}

export function bucketKeys(period: Pick<ReportPeriod, "fromKey" | "toKey" | "granularity">) {
  const keys: string[] = [];
  let cursor = bucketKeyOf(period.fromKey, period.granularity);
  const last = bucketKeyOf(period.toKey, period.granularity);
  while (cursor <= last) {
    keys.push(cursor);
    if (period.granularity === "day") cursor = addCalendarDays(cursor, 1);
    else if (period.granularity === "week") cursor = addCalendarDays(cursor, 7);
    else {
      const [y, m] = cursor.split("-").map(Number);
      cursor = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    }
  }
  return keys;
}

const DAY_LABEL = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  day: "2-digit",
  month: "2-digit",
});
const MONTH_LABEL = new Intl.DateTimeFormat("de-DE", {
  timeZone: "UTC",
  month: "short",
  year: "2-digit",
});

export function bucketLabel(key: string, granularity: ReportGranularity): string {
  const date = new Date(`${key}T12:00:00Z`);
  if (granularity === "month") return MONTH_LABEL.format(date);
  return granularity === "week" ? `ab ${DAY_LABEL.format(date)}` : DAY_LABEL.format(date);
}

export function periodLabel(period: Pick<ReportPeriod, "fromKey" | "toKey">): string {
  const fmt = (key: string) => key.split("-").reverse().join(".");
  return period.fromKey === period.toKey
    ? fmt(period.fromKey)
    : `${fmt(period.fromKey)} – ${fmt(period.toKey)}`;
}

// Fehlende Buckets mit 0 auffüllen (serverseitig aggregierte Reihen).
export function fillBuckets(
  period: Pick<ReportPeriod, "fromKey" | "toKey" | "granularity">,
  rows: { bucket: string; value: number }[],
): { key: string; label: string; value: number }[] {
  const byKey = new Map(rows.map((row) => [row.bucket, row.value]));
  return bucketKeys(period).map((key) => ({
    key,
    label: bucketLabel(key, period.granularity),
    value: byKey.get(key) ?? 0,
  }));
}
