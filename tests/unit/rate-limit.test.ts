import { beforeEach, describe, expect, it, vi } from "vitest";

// Hinweis zur Testabdeckung: Diese Tests mocken $queryRaw/$executeRaw und
// prüfen damit NUR, dass die Statusableitung (toStatus) korrekt ist und die
// richtige Funktion aufgerufen wird. Das eigentliche atomare Verhalten des
// "INSERT ... ON CONFLICT DO UPDATE"-Statements (Zähler-Reset nach Ablauf des
// Zeitfensters, Sperre bei Grenzwert, Race-Condition-Sicherheit über mehrere
// Prozesse) kann NUR gegen eine echte PostgreSQL-Instanz verifiziert werden
// und ist hier NICHT abgedeckt (siehe offene Punkte im Abschlussbericht).

const queryRawMock = vi.fn();
const executeRawMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args),
    $executeRaw: (...args: unknown[]) => executeRawMock(...args),
  },
}));

const {
  checkIdentifierRateLimit,
  checkOriginRateLimit,
  recordFailedIdentifierAttempt,
  recordFailedOriginAttempt,
  resetIdentifierRateLimit,
  cleanupExpiredLoginRateLimits,
} = await import("@/modules/auth/rate-limit");

beforeEach(() => {
  queryRawMock.mockReset();
  executeRawMock.mockReset();
});

describe("checkIdentifierRateLimit / checkOriginRateLimit", () => {
  it("reports not locked when no row exists", async () => {
    queryRawMock.mockResolvedValueOnce([]);
    const status = await checkIdentifierRateLimit("hash-a");
    expect(status).toEqual({ isLocked: false, lockedUntil: null });
  });

  it("reports not locked when locked_until is null", async () => {
    queryRawMock.mockResolvedValueOnce([{ locked_until: null }]);
    const status = await checkOriginRateLimit("hash-b");
    expect(status.isLocked).toBe(false);
  });

  it("reports not locked once lockedUntil is in the past (automatischer Ablauf)", async () => {
    const past = new Date(Date.now() - 60_000);
    queryRawMock.mockResolvedValueOnce([{ locked_until: past }]);
    const status = await checkIdentifierRateLimit("hash-c");
    expect(status.isLocked).toBe(false);
  });

  it("reports locked while lockedUntil is in the future", async () => {
    const future = new Date(Date.now() + 60_000);
    queryRawMock.mockResolvedValueOnce([{ locked_until: future }]);
    const status = await checkIdentifierRateLimit("hash-d");
    expect(status.isLocked).toBe(true);
    expect(status.lockedUntil).toEqual(future);
  });
});

describe("recordFailedIdentifierAttempt / recordFailedOriginAttempt", () => {
  it("issues a single atomic upsert statement for the identifier scope", async () => {
    executeRawMock.mockResolvedValueOnce(1);
    await recordFailedIdentifierAttempt("hash-e");
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });

  it("issues a single atomic upsert statement for the origin scope", async () => {
    executeRawMock.mockResolvedValueOnce(1);
    await recordFailedOriginAttempt("hash-f");
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});

describe("resetIdentifierRateLimit", () => {
  it("deletes the identifier bucket", async () => {
    executeRawMock.mockResolvedValueOnce(1);
    await resetIdentifierRateLimit("hash-g");
    expect(executeRawMock).toHaveBeenCalledTimes(1);
  });
});

describe("cleanupExpiredLoginRateLimits", () => {
  it("deletes expired rows in both tables and returns the counts, without being wired to a scheduler", async () => {
    executeRawMock.mockResolvedValueOnce(3).mockResolvedValueOnce(7);

    const result = await cleanupExpiredLoginRateLimits();

    expect(executeRawMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ identifierRowsDeleted: 3, originRowsDeleted: 7 });
  });
});
