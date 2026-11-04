import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { LOGIN_RATE_LIMIT } from "./config";

export type RateLimitStatus = {
  isLocked: boolean;
  lockedUntil: Date | null;
};

type RawRateLimitRow = {
  locked_until: Date | null;
};

function toStatus(row: RawRateLimitRow | undefined): RateLimitStatus {
  const lockedUntil = row?.locked_until ?? null;
  return {
    lockedUntil,
    isLocked: lockedUntil !== null && lockedUntil.getTime() > Date.now(),
  };
}

// Jede der folgenden Funktionen ist bewusst als vollständig eigenständiges,
// literales SQL-Statement geschrieben (keine dynamische Tabellennamen-
// Interpolation) - einfacher zu auditieren und ohne jede Einschleusungsfläche,
// auch wenn sich Stufe 1 und Stufe 2 dadurch strukturell wiederholen.

export async function checkIdentifierRateLimit(identifierHash: string): Promise<RateLimitStatus> {
  const rows = await prisma.$queryRaw<RawRateLimitRow[]>`
    SELECT locked_until FROM login_identifier_rate_limits WHERE identifier_hash = ${identifierHash}
  `;
  return toStatus(rows[0]);
}

export async function checkOriginRateLimit(originHash: string): Promise<RateLimitStatus> {
  const rows = await prisma.$queryRaw<RawRateLimitRow[]>`
    SELECT locked_until FROM login_origin_rate_limits WHERE origin_hash = ${originHash}
  `;
  return toStatus(rows[0]);
}

// Atomares "INSERT ... ON CONFLICT DO UPDATE": Postgres serialisiert
// konkurrierende Aufrufe für denselben Hash auf Zeilenebene, daher race-
// condition-sicher auch über mehrere PM2-Prozesse hinweg. Läuft das
// Zeitfenster ab, beginnt der Zähler automatisch wieder bei 1 ("automatischer
// Ablauf" statt dauerhafter Sperre).
export async function recordFailedIdentifierAttempt(identifierHash: string): Promise<void> {
  const { maxAttempts, windowMinutes, cooldownMinutes } = LOGIN_RATE_LIMIT.identifier;
  const windowInterval = `${windowMinutes} minutes`;
  const cooldownInterval = `${cooldownMinutes} minutes`;

  await prisma.$executeRaw`
    INSERT INTO login_identifier_rate_limits (id, identifier_hash, failed_count, window_started_at, locked_until, updated_at)
    VALUES (${createId()}, ${identifierHash}, 1, now(), NULL, now())
    ON CONFLICT (identifier_hash) DO UPDATE SET
      failed_count = CASE
        WHEN login_identifier_rate_limits.window_started_at <= now() - ${windowInterval}::interval THEN 1
        ELSE login_identifier_rate_limits.failed_count + 1
      END,
      window_started_at = CASE
        WHEN login_identifier_rate_limits.window_started_at <= now() - ${windowInterval}::interval THEN now()
        ELSE login_identifier_rate_limits.window_started_at
      END,
      locked_until = CASE
        WHEN login_identifier_rate_limits.window_started_at <= now() - ${windowInterval}::interval THEN NULL
        WHEN login_identifier_rate_limits.failed_count + 1 >= ${maxAttempts} THEN now() + ${cooldownInterval}::interval
        ELSE login_identifier_rate_limits.locked_until
      END,
      updated_at = now()
  `;
}

export async function recordFailedOriginAttempt(originHash: string): Promise<void> {
  const { maxAttempts, windowMinutes, cooldownMinutes } = LOGIN_RATE_LIMIT.origin;
  const windowInterval = `${windowMinutes} minutes`;
  const cooldownInterval = `${cooldownMinutes} minutes`;

  await prisma.$executeRaw`
    INSERT INTO login_origin_rate_limits (id, origin_hash, failed_count, window_started_at, locked_until, updated_at)
    VALUES (${createId()}, ${originHash}, 1, now(), NULL, now())
    ON CONFLICT (origin_hash) DO UPDATE SET
      failed_count = CASE
        WHEN login_origin_rate_limits.window_started_at <= now() - ${windowInterval}::interval THEN 1
        ELSE login_origin_rate_limits.failed_count + 1
      END,
      window_started_at = CASE
        WHEN login_origin_rate_limits.window_started_at <= now() - ${windowInterval}::interval THEN now()
        ELSE login_origin_rate_limits.window_started_at
      END,
      locked_until = CASE
        WHEN login_origin_rate_limits.window_started_at <= now() - ${windowInterval}::interval THEN NULL
        WHEN login_origin_rate_limits.failed_count + 1 >= ${maxAttempts} THEN now() + ${cooldownInterval}::interval
        ELSE login_origin_rate_limits.locked_until
      END,
      updated_at = now()
  `;
}

// Nur die Identifier-Stufe wird bei Erfolg zurückgesetzt. Die Origin-Stufe
// wird von mehreren Accounts geteilt; sie bei jedem einzelnen erfolgreichen
// Login zurückzusetzen, würde einem Angreifer erlauben, den Schutz durch
// einen bekannten/erratenen gültigen Account immer wieder zu entwerten.
export async function resetIdentifierRateLimit(identifierHash: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM login_identifier_rate_limits WHERE identifier_hash = ${identifierHash}
  `;
}

export type CleanupResult = {
  identifierRowsDeleted: number;
  originRowsDeleted: number;
};

// Zentrale Aufräum-Funktion für beide Rate-Limit-Tabellen - bewusst NICHT
// automatisch verdrahtet (kein Cronjob, kein Aufruf aus verify-login.ts).
// Eine Zeile ist sicher löschbar, wenn sie weder aktuell sperrt noch
// innerhalb ihres Zählfensters liegt - andernfalls würde ein laufender
// Sperr- oder Zählzustand vorzeitig verloren gehen. Nur ein einziger Ort im
// Code kennt dieses Kriterium, damit später kein verteiltes/inkonsistentes
// Cleanup in mehreren Modulen entsteht. Vorgesehen für einen künftigen
// periodischen Job (z. B. PM2 Cron oder pg_cron), der hier bewusst noch
// nicht angelegt wird.
export async function cleanupExpiredLoginRateLimits(): Promise<CleanupResult> {
  const identifierWindowInterval = `${LOGIN_RATE_LIMIT.identifier.windowMinutes} minutes`;
  const originWindowInterval = `${LOGIN_RATE_LIMIT.origin.windowMinutes} minutes`;

  const identifierRowsDeleted = await prisma.$executeRaw`
    DELETE FROM login_identifier_rate_limits
    WHERE (locked_until IS NULL OR locked_until <= now())
      AND window_started_at <= now() - ${identifierWindowInterval}::interval
  `;

  const originRowsDeleted = await prisma.$executeRaw`
    DELETE FROM login_origin_rate_limits
    WHERE (locked_until IS NULL OR locked_until <= now())
      AND window_started_at <= now() - ${originWindowInterval}::interval
  `;

  return { identifierRowsDeleted, originRowsDeleted };
}
