// Geld-Strategie: Beträge werden ausschließlich als Integer in Cent
// (kleinste Währungseinheit) gespeichert/verarbeitet - niemals als
// JavaScript-Float. Vermeidet Rundungsfehler (0.1 + 0.2 !== 0.3) vollständig,
// ohne die zusätzliche Komplexität von Prismas Decimal-Typ (eigene
// Decimal.js-artige Arithmetik) für diesen einfachen Anwendungsfall zu
// benötigen. Primäre Währung ist EUR.

const EUR_FORMATTER = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function euroToCents(euroInput: string | number): number {
  const euro =
    typeof euroInput === "string" ? Number.parseFloat(euroInput.replace(",", ".")) : euroInput;
  if (!Number.isFinite(euro)) {
    throw new Error("Ungültiger Geldbetrag.");
  }
  return Math.round(euro * 100);
}

export function centsToEuro(cents: number): number {
  return cents / 100;
}

export function formatCentsAsEuro(cents: number): string {
  return EUR_FORMATTER.format(centsToEuro(cents));
}

// Strict decimal parsing for new quote inputs. No binary float or truncating parseFloat.
export function decimalToScaledInteger(input: string, digits: number): number {
  const normalized = input.trim().replace(",", ".");
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(normalized))
    throw new Error("Ungültige Dezimalzahl.");
  const [whole, fraction = ""] = normalized.split(".");
  const value = BigInt(whole) * BigInt(10) ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0"));
  if (value > BigInt(2_147_483_647)) throw new Error("Wert ist zu groß.");
  return Number(value);
}

export function scaledIntegerToDecimal(value: number, digits: number): string {
  const scale = 10 ** digits;
  return `${Math.floor(value / scale)}.${String(value % scale).padStart(digits, "0")}`;
}
