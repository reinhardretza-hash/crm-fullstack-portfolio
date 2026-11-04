// Zentrale Normalisierungs-Helper - werden von Validierung, Duplikaterkennung
// und Formularen gemeinsam genutzt. Keine Normalisierungslogik doppelt in
// einzelnen Modulen implementieren.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Entfernt alles außer Ziffern und einem führenden "+" - genug, um
// "+1 (202) 555-0101" und "001 202 5550101" für Vergleichszwecke
// zusammenzuführen, ohne eine vollständige Telefonnummern-Bibliothek zu
// benötigen (für dieses interne CRM nicht gerechtfertigt).
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasLeadingPlus ? `+${digits}` : digits;
}

const DANGEROUS_URL_SCHEMES = ["javascript:", "data:", "vbscript:", "file:"];

// Akzeptiert sowohl "example.de" als auch "https://example.de" und liefert
// immer eine vollständige, sichere URL mit https:// zurück. Gefährliche
// Schemes werden abgelehnt. Wirft bei ungültiger Eingabe.
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("URL darf nicht leer sein.");
  }

  const lower = trimmed.toLowerCase();
  if (DANGEROUS_URL_SCHEMES.some((scheme) => lower.startsWith(scheme))) {
    throw new Error("Ungültiges URL-Schema.");
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("Ungültige URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Nur http/https-URLs sind erlaubt.");
  }

  return url.toString();
}

// Liefert die reine, vergleichbare Domain ohne "www."-Präfix, ohne Pfad,
// ohne Groß-/Kleinschreibungsunterschiede - für Duplikaterkennung.
export function extractDomain(input: string): string {
  const normalized = normalizeUrl(input);
  const host = new URL(normalized).hostname.toLowerCase();
  return host.startsWith("www.") ? host.slice(4) : host;
}

// LinkedIn-URLs zusätzlich um Query-Parameter und einen abschließenden Slash
// bereinigt, damit z. B. "linkedin.com/in/max-mustermann/?x=1" und
// "https://www.linkedin.com/in/max-mustermann" als dieselbe URL erkannt werden.
export function normalizeLinkedinUrl(input: string): string {
  const normalized = normalizeUrl(input);
  const url = new URL(normalized);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.replace(/\/+$/, "");
  return `https://${host}${pathname}`;
}

// "Handwerk" / "handwerk" / "HANDWERK" -> "handwerk", damit Tag.normalizedName
// keine Duplikate zulässt.
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
