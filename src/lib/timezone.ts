// Zentrale Europe/Berlin-Zeitzonenlogik: intern wird IMMER in UTC
// gespeichert (siehe Vorgabe), aber "heute"/"überfällig"/"kommend" muss
// nach der tatsächlichen Zeitzone der Organisation beurteilt werden, nicht
// nach dem UTC-Kalendertag - sonst würde z. B. 23:30 Uhr Berlin (= 21:30
// UTC im Sommer) fälschlich schon als "morgen" gelten.
//
// Bewusst ohne zusätzliche Abhängigkeit (date-fns-tz o. Ä.) umgesetzt: die
// eingebaute `Intl`-API kennt die vollständige IANA-Zeitzonendatenbank
// inklusive Sommer-/Winterzeit-Übergängen und reicht für die hier
// benötigten Operationen (Kalendertag ermitteln, lokale Uhrzeit -> UTC)
// vollständig aus.
export const BERLIN_TIME_ZONE = "Europe/Berlin";

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getUTCFullYear() >= 100 &&
    date.getUTCFullYear() <= 9998
  );
}

// Calendar arithmetic, never elapsed 24h arithmetic across Berlin DST.
export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Strict wall-clock conversion: reject the spring gap and the ambiguous
// autumn hour rather than silently choosing another time/offset.
export function strictBerlinTimeToUtc(date: string, time: string): Date {
  if (!isCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Ungültiges Datum oder Uhrzeit.");
  const guess = new Date(`${date}T${time}:00Z`).getTime();
  const offsets = new Set(
    [-36, 0, 36].map((h) => getTimeZoneOffsetMs(new Date(guess + h * 3600000), BERLIN_TIME_ZONE)),
  );
  const candidates = [...offsets]
    .map((offset) => new Date(guess - offset))
    .filter((instant) => {
      const local = splitUtcToBerlinDateAndTime(instant);
      return local.dateStr === date && local.timeStr === time;
    });
  if (candidates.length !== 1)
    throw new Error(
      "Diese Uhrzeit ist durch die Zeitumstellung nicht eindeutig oder existiert nicht. Bitte eine andere Uhrzeit wählen.",
    );
  return candidates[0];
}

// Liefert den Kalendertag (YYYY-MM-DD) eines UTC-Instants in der
// angegebenen Zeitzone - die Basis für jeden "ist das heute?"-Vergleich.
export function dateKeyInTimeZone(date: Date, timeZone: string = BERLIN_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function isSameDayInTimeZone(
  a: Date,
  b: Date,
  timeZone: string = BERLIN_TIME_ZONE,
): boolean {
  return dateKeyInTimeZone(a, timeZone) === dateKeyInTimeZone(b, timeZone);
}

// Ermittelt den UTC-Offset (in Millisekunden), den `timeZone` für den
// gegebenen Instant hat - notwendig, um eine lokale Wanduhrzeit
// (Jahr/Monat/Tag/Stunde/Minute) korrekt in einen UTC-Instant
// umzurechnen, auch über Sommer-/Winterzeit-Wechsel hinweg.
function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - instant.getTime();
}

// Wandelt eine lokale Wanduhrzeit (z. B. "01.10.2026, 14:30 Uhr Berlin") in
// den korrekten UTC-Instant um. Einmaliger Näherungsschritt + Korrektur
// anhand des tatsächlichen Offsets an diesem Instant - das ist das
// Standardverfahren, das auch date-fns-tz für `zonedTimeToUtc` verwendet,
// und behandelt Sommer-/Winterzeit-Übergänge korrekt.
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string = BERLIN_TIME_ZONE,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

// Kombiniert ein Datum (YYYY-MM-DD) mit einer optionalen Uhrzeit (HH:mm) zu
// einem UTC-Instant. Ohne Uhrzeit wird bewusst 23:59:59 Europe/Berlin des
// gewählten Tages verwendet (nicht 00:00 Uhr) - siehe ausführliche
// Begründung beim Task-Model in prisma/schema.prisma: eine Aufgabe "fällig
// am 01.10." soll bis zum Ende dieses Tages nicht als überfällig gelten.
export function combineDateAndOptionalTime(
  dateStr: string,
  timeStr: string | undefined,
  timeZone: string = BERLIN_TIME_ZONE,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (timeStr) {
    const [hour, minute] = timeStr.split(":").map(Number);
    return zonedTimeToUtc(year, month, day, hour, minute, 0, timeZone);
  }
  return zonedTimeToUtc(year, month, day, 23, 59, 59, timeZone);
}

// Liefert den UTC-Anfang und das UTC-Ende des Europe/Berlin-Kalendertags,
// auf den `instant` fällt - Grundlage für "heute"-Datenbankabfragen (siehe
// src/modules/tasks/queries.ts), bei denen die Grenze als echtes
// Datumsintervall statt per Nachbearbeitung im Code gebraucht wird.
export function berlinDayRangeUtc(
  instant: Date,
  timeZone: string = BERLIN_TIME_ZONE,
): { start: Date; end: Date } {
  const [year, month, day] = dateKeyInTimeZone(instant, timeZone).split("-").map(Number);
  const start = zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const end = new Date(zonedTimeToUtc(year, month, day, 23, 59, 59, timeZone).getTime() + 999);
  return { start, end };
}

// Für die Anzeige in Formularen: liefert "YYYY-MM-DD" und "HH:mm" (Europe/
// Berlin) aus einem UTC-Instant. `hadExplicitTime` ist eine Heuristik (23:
// 59:59 Berlin => vermutlich ohne explizite Uhrzeit gespeichert) - rein
// kosmetisch für die Formular-Vorbefüllung, keine fachliche Logik hängt
// daran.
export function splitUtcToBerlinDateAndTime(date: Date): {
  dateStr: string;
  timeStr: string;
  hadExplicitTime: boolean;
} {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: BERLIN_TIME_ZONE });
  const timeFormatter = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = dateFormatter.format(date);
  const timeStr = timeFormatter.format(date);
  return { dateStr, timeStr, hadExplicitTime: timeStr !== "23:59" };
}
