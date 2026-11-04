import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/modules/auth/hash";

const findUniqueMock = vi.fn();
const writeAuthAuditLogMock = vi.fn();
const checkIdentifierRateLimitMock = vi.fn();
const checkOriginRateLimitMock = vi.fn();
const recordFailedIdentifierAttemptMock = vi.fn();
const recordFailedOriginAttemptMock = vi.fn();
const resetIdentifierRateLimitMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

vi.mock("@/modules/auth/audit", () => ({
  writeAuthAuditLog: (...args: unknown[]) => writeAuthAuditLogMock(...args),
}));

vi.mock("@/modules/auth/rate-limit", () => ({
  checkIdentifierRateLimit: (...args: unknown[]) => checkIdentifierRateLimitMock(...args),
  checkOriginRateLimit: (...args: unknown[]) => checkOriginRateLimitMock(...args),
  recordFailedIdentifierAttempt: (...args: unknown[]) => recordFailedIdentifierAttemptMock(...args),
  recordFailedOriginAttempt: (...args: unknown[]) => recordFailedOriginAttemptMock(...args),
  resetIdentifierRateLimit: (...args: unknown[]) => resetIdentifierRateLimitMock(...args),
}));

const { verifyLogin } = await import("@/modules/auth/verify-login");

const NOT_LOCKED = { isLocked: false, lockedUntil: null };
const LOCKED = { isLocked: true, lockedUntil: new Date(Date.now() + 60_000) };

const request = new Request("http://localhost/api/auth/callback/credentials", {
  headers: { "x-forwarded-for": "203.0.113.5" },
});

async function makeStoredUser(overrides: Partial<{ isActive: boolean }> = {}) {
  return {
    id: "user-1",
    email: "max@example.com",
    passwordHash: await hashPassword("correct-password-123"),
    firstName: "Max",
    lastName: "Mustermann",
    role: "USER" as const,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  findUniqueMock.mockReset();
  writeAuthAuditLogMock.mockReset();
  checkIdentifierRateLimitMock.mockReset().mockResolvedValue(NOT_LOCKED);
  checkOriginRateLimitMock.mockReset().mockResolvedValue(NOT_LOCKED);
  recordFailedIdentifierAttemptMock.mockReset();
  recordFailedOriginAttemptMock.mockReset();
  resetIdentifierRateLimitMock.mockReset();
});

describe("verifyLogin", () => {
  it("succeeds with the correct password", async () => {
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    const result = await verifyLogin("max@example.com", "correct-password-123", request);

    expect(result).toEqual({ success: true, userId: "user-1" });
  });

  it("fails with an incorrect password", async () => {
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    const result = await verifyLogin("max@example.com", "wrong-password", request);

    expect(result).toEqual({ success: false });
  });

  it("fails for an unknown user without leaking that the account does not exist", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const result = await verifyLogin("unknown@example.com", "any-password", request);

    expect(result).toEqual({ success: false });
  });

  it("fails for a deactivated user, even with the correct password", async () => {
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser({ isActive: false }));

    const result = await verifyLogin("max@example.com", "correct-password-123", request);

    expect(result).toEqual({ success: false });
  });

  it("fails immediately when the identifier is rate-limited (rate limit greift)", async () => {
    checkIdentifierRateLimitMock.mockResolvedValueOnce(LOCKED);
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    const result = await verifyLogin("max@example.com", "correct-password-123", request);

    expect(result).toEqual({ success: false });
    // Bei Sperre wird gar nicht erst nach dem Benutzer gesucht.
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("fails immediately when the origin is rate-limited", async () => {
    checkOriginRateLimitMock.mockResolvedValueOnce(LOCKED);

    const result = await verifyLogin("max@example.com", "correct-password-123", request);

    expect(result).toEqual({ success: false });
  });

  it("succeeds once the rate limit window has expired (rate limit läuft wieder ab)", async () => {
    // checkIdentifierRateLimit selbst bildet den automatischen Ablauf ab
    // (siehe rate-limit.test.ts); hier wird nur sichergestellt, dass
    // verifyLogin einen nicht (mehr) gesperrten Status korrekt als "nicht
    // gesperrt" behandelt und den Login normal fortsetzt.
    checkIdentifierRateLimitMock.mockResolvedValueOnce(NOT_LOCKED);
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    const result = await verifyLogin("max@example.com", "correct-password-123", request);

    expect(result).toEqual({ success: true, userId: "user-1" });
  });

  it("resets the identifier rate limit on successful login", async () => {
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    await verifyLogin("max@example.com", "correct-password-123", request);

    expect(resetIdentifierRateLimitMock).toHaveBeenCalledTimes(1);
    expect(recordFailedIdentifierAttemptMock).not.toHaveBeenCalled();
    expect(recordFailedOriginAttemptMock).not.toHaveBeenCalled();
  });

  it("records a failed attempt on both scopes when the login fails", async () => {
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    await verifyLogin("max@example.com", "wrong-password", request);

    expect(recordFailedIdentifierAttemptMock).toHaveBeenCalledTimes(1);
    expect(recordFailedOriginAttemptMock).toHaveBeenCalledTimes(1);
    expect(resetIdentifierRateLimitMock).not.toHaveBeenCalled();
  });

  it("writes a LOGIN_SUCCESS audit log entry on success", async () => {
    findUniqueMock.mockResolvedValueOnce(await makeStoredUser());

    await verifyLogin("max@example.com", "correct-password-123", request);

    expect(writeAuthAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "LOGIN_SUCCESS" }),
    );
  });

  it("writes a LOGIN_FAILED audit log entry without the plaintext email on failure", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    await verifyLogin("unknown@example.com", "any-password", request);

    expect(writeAuthAuditLogMock).toHaveBeenCalledTimes(1);
    const call = writeAuthAuditLogMock.mock.calls[0][0];
    expect(call.action).toBe("LOGIN_FAILED");
    expect(JSON.stringify(call)).not.toContain("unknown@example.com");
  });
});
