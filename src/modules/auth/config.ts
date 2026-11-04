// Zentrale, konfigurierbare Grenzwerte für das Login-Rate-Limiting.
// Keine Magic Numbers im Code – jede Anpassung geschieht ausschließlich hier.
export const LOGIN_RATE_LIMIT = {
  // Stufe 1: begrenzt Versuche gegen einen einzelnen Identifier (E-Mail).
  identifier: {
    maxAttempts: 5,
    windowMinutes: 15,
    cooldownMinutes: 15,
  },
  // Stufe 2: gröberer Schutz gegen verteilte Versuche mit vielen
  // verschiedenen E-Mail-Adressen von derselben Herkunft (IP).
  origin: {
    maxAttempts: 20,
    windowMinutes: 15,
    cooldownMinutes: 15,
  },
} as const;

// Exakt eine generische Meldung für jeden Login-Fehlerfall (falsche E-Mail,
// falsches Passwort, deaktivierter Benutzer, Rate Limit) – verhindert User
// Enumeration über unterschiedliche Fehlermeldungen.
export const GENERIC_LOGIN_ERROR = "E-Mail oder Passwort ist falsch.";

export const BCRYPT_SALT_ROUNDS = 12;
