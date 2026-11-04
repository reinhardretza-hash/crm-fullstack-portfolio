import { compare, hash, hashSync } from "bcryptjs";
import { BCRYPT_SALT_ROUNDS } from "./config";

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return hash(plainTextPassword, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(plainTextPassword, passwordHash);
}

// Timing-Ausgleich für nicht existierende Benutzer: Ohne diesen Dummy-Hash
// würde `verifyLogin()` bei unbekannter E-Mail-Adresse sofort zurückkehren,
// während ein existierender Account einen ~100ms teuren bcrypt-Vergleich
// durchläuft - dieser Zeitunterschied allein würde bereits verraten, ob ein
// Account existiert (User Enumeration über eine Timing-Seitenkanal).
//
// Erzeugung: `hashSync(<fest im Code stehender, willkürlicher String>,
// BCRYPT_SALT_ROUNDS)` - exakt derselbe Algorithmus (bcrypt) und exakt
// derselbe Work Factor (BCRYPT_SALT_ROUNDS aus config.ts) wie bei echten
// Benutzerpasswörtern in hashPassword(), damit der Vergleich realistisch
// gleich lange dauert. Der Eingabe-String ist KEIN Secret, wird nirgends
// ausgegeben/geloggt und entspricht nachweislich keinem Passwort irgendeines
// echten Benutzers in diesem System (er wird nie über hashPassword() für
// einen echten Account erzeugt). Er dient ausschließlich als Vergleichsziel
// für compare() und hat sonst keine Funktion. Einmal pro Prozessstart
// berechnet (bcrypt ist bewusst langsam; pro Request neu hashen wäre
// unnötige Last).
export const DUMMY_PASSWORD_HASH = hashSync(
  "rdevolution-dummy-comparison-target-never-a-real-password",
  BCRYPT_SALT_ROUNDS,
);
