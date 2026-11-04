import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { LOGIN_RATE_LIMIT } from "@/modules/auth/config";
import {
  checkIdentifierRateLimit,
  checkOriginRateLimit,
  cleanupExpiredLoginRateLimits,
  recordFailedIdentifierAttempt,
  recordFailedOriginAttempt,
  resetIdentifierRateLimit,
} from "@/modules/auth/rate-limit";

// Echte Integrationstests gegen PostgreSQL - das eigentliche
// "INSERT ... ON CONFLICT DO UPDATE"-SQL wird hier zum ersten Mal wirklich
// ausgeführt (in den Unit-Tests war $executeRaw/$queryRaw gemockt).

describe("Identifier rate limit (real PostgreSQL)", () => {
  it("increments the counter with each failed attempt", async () => {
    const hash = "identifier-hash-counter";

    await recordFailedIdentifierAttempt(hash);
    let row = await prisma.loginIdentifierRateLimit.findUnique({ where: { identifierHash: hash } });
    expect(row?.failedCount).toBe(1);

    await recordFailedIdentifierAttempt(hash);
    row = await prisma.loginIdentifierRateLimit.findUnique({ where: { identifierHash: hash } });
    expect(row?.failedCount).toBe(2);
  });

  it("locks once the configured threshold is reached", async () => {
    const hash = "identifier-hash-threshold";

    for (let i = 0; i < LOGIN_RATE_LIMIT.identifier.maxAttempts; i++) {
      await recordFailedIdentifierAttempt(hash);
    }

    const row = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: hash },
    });
    expect(row?.failedCount).toBe(LOGIN_RATE_LIMIT.identifier.maxAttempts);
    expect(row?.lockedUntil).not.toBeNull();
    expect(row!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const status = await checkIdentifierRateLimit(hash);
    expect(status.isLocked).toBe(true);
  });

  it("unlocks once the cooldown (lockedUntil) has genuinely passed", async () => {
    const hash = "identifier-hash-cooldown-expiry";

    for (let i = 0; i < LOGIN_RATE_LIMIT.identifier.maxAttempts; i++) {
      await recordFailedIdentifierAttempt(hash);
    }
    let status = await checkIdentifierRateLimit(hash);
    expect(status.isLocked).toBe(true);

    // Simuliert echten Zeitablauf: die Sperre selbst liegt jetzt in der
    // Vergangenheit (checkIdentifierRateLimit bewertet ausschließlich
    // `lockedUntil`, nicht `windowStartedAt` - das Fenster bestimmt nur das
    // Zählverhalten beim nächsten fehlgeschlagenen Versuch, siehe unten).
    await prisma.loginIdentifierRateLimit.update({
      where: { identifierHash: hash },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    status = await checkIdentifierRateLimit(hash);
    expect(status.isLocked).toBe(false);
  });

  it("starts a new counting window once windowMinutes have passed, instead of accumulating forever", async () => {
    const hash = "identifier-hash-window-expiry";

    // Drei Fehlversuche - bewusst unter dem Schwellenwert, damit lockedUntil
    // null bleibt und ausschließlich das Fenster (windowStartedAt) getestet wird.
    await recordFailedIdentifierAttempt(hash);
    await recordFailedIdentifierAttempt(hash);
    await recordFailedIdentifierAttempt(hash);
    let row = await prisma.loginIdentifierRateLimit.findUnique({ where: { identifierHash: hash } });
    expect(row?.failedCount).toBe(3);
    expect(row?.lockedUntil).toBeNull();

    // Simuliert echten Zeitablauf des Zählfensters.
    await prisma.loginIdentifierRateLimit.update({
      where: { identifierHash: hash },
      data: {
        windowStartedAt: new Date(
          Date.now() - (LOGIN_RATE_LIMIT.identifier.windowMinutes + 1) * 60_000,
        ),
      },
    });

    // Ein neuer Fehlversuch nach Fensterablauf beginnt wieder bei 1, nicht
    // beim alten Zählerstand (3+1=4).
    await recordFailedIdentifierAttempt(hash);
    row = await prisma.loginIdentifierRateLimit.findUnique({ where: { identifierHash: hash } });
    expect(row?.failedCount).toBe(1);
    expect(row?.lockedUntil).toBeNull();
  });

  it("removes the identifier bucket entirely on successful login", async () => {
    const hash = "identifier-hash-reset-on-success";
    await recordFailedIdentifierAttempt(hash);
    await resetIdentifierRateLimit(hash);

    const row = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: hash },
    });
    expect(row).toBeNull();
  });
});

describe("Origin rate limit (real PostgreSQL)", () => {
  it("shares the same counter across different identifiers from the same origin", async () => {
    const originHash = "origin-hash-shared";

    await recordFailedOriginAttempt(originHash);
    await recordFailedOriginAttempt(originHash);
    await recordFailedOriginAttempt(originHash);

    const row = await prisma.loginOriginRateLimit.findUnique({ where: { originHash } });
    expect(row?.failedCount).toBe(3);
  });

  it("locks once the (higher) origin threshold is reached", async () => {
    const originHash = "origin-hash-threshold";

    for (let i = 0; i < LOGIN_RATE_LIMIT.origin.maxAttempts; i++) {
      await recordFailedOriginAttempt(originHash);
    }

    const status = await checkOriginRateLimit(originHash);
    expect(status.isLocked).toBe(true);
  });

  it("is NOT cleared by a successful login (shared across accounts)", async () => {
    const originHash = "origin-hash-not-reset";
    await recordFailedOriginAttempt(originHash);

    // resetIdentifierRateLimit betrifft absichtlich nur die Identifier-Stufe.
    await resetIdentifierRateLimit("unrelated-identifier-hash");

    const row = await prisma.loginOriginRateLimit.findUnique({ where: { originHash } });
    expect(row?.failedCount).toBe(1);
  });

  it("expires and starts a new window like the identifier limit", async () => {
    const originHash = "origin-hash-window-expiry";
    await recordFailedOriginAttempt(originHash);

    await prisma.loginOriginRateLimit.update({
      where: { originHash },
      data: {
        windowStartedAt: new Date(
          Date.now() - (LOGIN_RATE_LIMIT.origin.windowMinutes + 1) * 60_000,
        ),
      },
    });

    const status = await checkOriginRateLimit(originHash);
    expect(status.isLocked).toBe(false);
  });
});

describe("Parallel failed attempts against the same identifier (race condition test)", () => {
  it("loses no increments under concurrent access - the atomic SQL upsert, not a mock, is exercised here", async () => {
    const hash = "identifier-hash-concurrency";
    const concurrentAttempts = 15;

    await Promise.all(
      Array.from({ length: concurrentAttempts }, () => recordFailedIdentifierAttempt(hash)),
    );

    const row = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: hash },
    });
    // Exactly one row must exist (no duplicate rows from a lost ON CONFLICT),
    // and the counter must reflect every single attempt - no lost updates.
    const rowCount = await prisma.loginIdentifierRateLimit.count({
      where: { identifierHash: hash },
    });
    expect(rowCount).toBe(1);
    expect(row?.failedCount).toBe(concurrentAttempts);
    // 15 > maxAttempts (5), so it must end up locked.
    expect(row?.lockedUntil).not.toBeNull();
  });
});

describe("cleanupExpiredLoginRateLimits (real PostgreSQL)", () => {
  it("deletes expired rows but keeps active ones", async () => {
    const expiredHash = "identifier-hash-cleanup-expired";
    const activeHash = "identifier-hash-cleanup-active";

    await recordFailedIdentifierAttempt(expiredHash);
    await prisma.loginIdentifierRateLimit.update({
      where: { identifierHash: expiredHash },
      data: {
        windowStartedAt: new Date(
          Date.now() - (LOGIN_RATE_LIMIT.identifier.windowMinutes + 5) * 60_000,
        ),
      },
    });

    await recordFailedIdentifierAttempt(activeHash);

    const result = await cleanupExpiredLoginRateLimits();
    expect(result.identifierRowsDeleted).toBe(1);

    const expiredRow = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: expiredHash },
    });
    const activeRow = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: activeHash },
    });
    expect(expiredRow).toBeNull();
    expect(activeRow).not.toBeNull();
  });
});
