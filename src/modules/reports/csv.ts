// CSV-Export: UTF-8 (mit BOM für Excel), RFC-4180-Escaping und Schutz vor
// CSV-/Formel-Injection (Zellen, die mit = + - @ oder Tab/CR beginnen,
// bekommen ein führendes Apostroph).
export function sanitizeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(sanitizeCsvCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function centsToCsvAmount(cents: number): string {
  // Reine Integer-Arithmetik, kein Float.
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
