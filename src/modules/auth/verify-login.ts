import { prisma } from "@/lib/prisma";
import { writeAuthAuditLog } from "./audit";
import { getClientIp } from "./get-client-ip";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./hash";
import { hashIdentifier, hashOrigin, normalizeEmail } from "./identifier";
import {
  checkIdentifierRateLimit,
  checkOriginRateLimit,
  recordFailedIdentifierAttempt,
  recordFailedOriginAttempt,
  resetIdentifierRateLimit,
} from "./rate-limit";

export type VerifyLoginResult =
  | { success: true; userId: string; authVersion: number }
  | { success: false };

// Eigenständig exportiert (statt inline in der Credentials-Provider-
// Konfiguration), damit dieser sicherheitskritische Ablauf ohne vollständige
// Auth.js-Initialisierung unit-testbar ist. Liefert für JEDEN Fehlerfall
// (unbekannter Benutzer, falsches Passwort, deaktiviert, rate-limited)
// identisch `{ success: false }` - der Aufrufer darf daraus keine
// unterschiedliche Fehlermeldung ableiten (verhindert User Enumeration).
export async function verifyLogin(
  email: string,
  password: string,
  request: Request,
): Promise<VerifyLoginResult> {
  const identifierHash = hashIdentifier(email);
  const originHash = hashOrigin(getClientIp(request));

  const [identifierStatus, originStatus] = await Promise.all([
    checkIdentifierRateLimit(identifierHash),
    checkOriginRateLimit(originHash),
  ]);

  if (identifierStatus.isLocked || originStatus.isLocked) {
    await writeAuthAuditLog({ action: "LOGIN_FAILED", identifierHash });
    return { success: false };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(email) },
  });

  // Auch ohne existierenden User wird ein vollwertiger bcrypt-Vergleich gegen
  // einen Dummy-Hash durchgeführt, damit die Antwortzeit nicht verrät, ob die
  // E-Mail-Adresse existiert.
  const isPasswordValid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  const loginIsValid = Boolean(user) && user!.isActive && isPasswordValid;

  if (!loginIsValid) {
    await Promise.all([
      recordFailedIdentifierAttempt(identifierHash),
      recordFailedOriginAttempt(originHash),
    ]);
    await writeAuthAuditLog({ action: "LOGIN_FAILED", userId: user?.id, identifierHash });
    return { success: false };
  }

  await resetIdentifierRateLimit(identifierHash);
  await writeAuthAuditLog({ action: "LOGIN_SUCCESS", userId: user!.id });

  return { success: true, userId: user!.id, authVersion: user!.authVersion };
}
