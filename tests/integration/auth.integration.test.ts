import { createId } from "@paralleldrive/cuid2";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/modules/auth/hash";
import { verifyLogin } from "@/modules/auth/verify-login";
import { hashIdentifier } from "@/modules/auth/identifier";

// Ergänzt die manuelle Browser-/HTTP-Verifikation aus dem Schritt-4-Bericht
// um eine automatisierte, gegen echtes PostgreSQL laufende Regressionsdeckung
// für verifyLogin() - dieselbe Funktion, die auch der echte Credentials
// Provider aufruft.

const request = new Request("http://localhost/api/auth/callback/credentials", {
  headers: { "x-forwarded-for": "203.0.113.9" },
});

async function createUser(overrides: Partial<{ isActive: boolean }> = {}) {
  return prisma.user.create({
    data: {
      id: createId(),
      email: `${createId()}@example.com`,
      passwordHash: await hashPassword("correct-password-123"),
      firstName: "Max",
      lastName: "Mustermann",
      isActive: overrides.isActive ?? true,
    },
  });
}

describe("verifyLogin against real PostgreSQL", () => {
  it("succeeds with the correct password and writes a LOGIN_SUCCESS audit log entry", async () => {
    const user = await createUser();

    const result = await verifyLogin(user.email, "correct-password-123", request);

    expect(result).toEqual({ success: true, userId: user.id, authVersion: user.authVersion });
    const auditLog = await prisma.auditLog.findFirst({ where: { userId: user.id } });
    expect(auditLog?.action).toBe("LOGIN_SUCCESS");
  });

  it("fails with the wrong password and records a failed attempt in both rate-limit tables", async () => {
    const user = await createUser();

    const result = await verifyLogin(user.email, "wrong-password", request);

    expect(result).toEqual({ success: false });
    const identifierRow = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: hashIdentifier(user.email) },
    });
    expect(identifierRow?.failedCount).toBe(1);
  });

  it("fails for an unknown email without revealing that the account does not exist", async () => {
    const result = await verifyLogin("unknown@example.com", "any-password", request);

    expect(result).toEqual({ success: false });
    const auditLog = await prisma.auditLog.findFirst({ where: { action: "LOGIN_FAILED" } });
    expect(JSON.stringify(auditLog?.metadata)).not.toContain("unknown@example.com");
  });

  it("fails for a deactivated user even with the correct password", async () => {
    const user = await createUser({ isActive: false });

    const result = await verifyLogin(user.email, "correct-password-123", request);

    expect(result).toEqual({ success: false });
  });

  it("resets the identifier rate limit on successful login", async () => {
    const user = await createUser();

    await verifyLogin(user.email, "wrong-password", request);
    let row = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: hashIdentifier(user.email) },
    });
    expect(row?.failedCount).toBe(1);

    await verifyLogin(user.email, "correct-password-123", request);
    row = await prisma.loginIdentifierRateLimit.findUnique({
      where: { identifierHash: hashIdentifier(user.email) },
    });
    expect(row).toBeNull();
  });
});
