// Formatiert ein Date für ein <input type="datetime-local">-Feld
// (lokale Zeit, kein "Z"-Suffix) - gibt "" zurück, wenn kein Datum vorhanden.
export function toDateTimeLocalValue(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
