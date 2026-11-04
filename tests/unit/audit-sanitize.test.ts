import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/modules/audit/sanitize";

describe("sanitizeAuditMetadata", () => {
  it("returns null for missing metadata", () => {
    expect(sanitizeAuditMetadata(null)).toBeNull();
    expect(sanitizeAuditMetadata(undefined)).toBeNull();
  });

  it("returns null for non-object metadata", () => {
    expect(sanitizeAuditMetadata("a string")).toBeNull();
    expect(sanitizeAuditMetadata(42)).toBeNull();
  });

  it("returns null for an array (not a plain object)", () => {
    expect(sanitizeAuditMetadata([1, 2, 3])).toBeNull();
  });

  it("passes through safe primitive fields", () => {
    expect(sanitizeAuditMetadata({ fromRole: "USER", toRole: "ADMIN" })).toEqual({
      fromRole: "USER",
      toRole: "ADMIN",
    });
  });

  it("strips fields whose key suggests a password/secret/token, case-insensitively", () => {
    const result = sanitizeAuditMetadata({
      password: "secret123",
      passwordHash: "$2b$10$...",
      newPassword: "x",
      apiToken: "abc",
      sessionId: "xyz",
      fromName: "visible",
    });
    expect(result).toEqual({ fromName: "visible" });
  });

  it("never leaks a bcrypt-looking hash even under an unexpected key name", () => {
    const result = sanitizeAuditMetadata({ note: "$2b$10$abcdefghijklmnopqrstuv" });
    expect(result).toBeNull();
  });

  it("drops nested objects and arrays instead of dumping them raw", () => {
    const result = sanitizeAuditMetadata({
      fromName: "ok",
      nested: { a: 1 },
      arrayField: [1, 2, 3],
    });
    expect(result).toEqual({ fromName: "ok" });
  });

  it("converts null/undefined values to a dash instead of dropping the key", () => {
    expect(sanitizeAuditMetadata({ fromName: null })).toEqual({ fromName: "–" });
  });

  it("returns null when every field was filtered out", () => {
    expect(sanitizeAuditMetadata({ password: "secret" })).toBeNull();
  });
  it("drops unknown keys instead of trusting harmless-looking names", () => {
    expect(
      sanitizeAuditMetadata({ note: "credential", apiKey: "credential", role: "USER" }),
    ).toEqual({ role: "USER" });
  });
  it("drops hashes and JWTs even under whitelisted fields", () => {
    expect(
      sanitizeAuditMetadata({
        fromName: "$2b$12$abcdefghijklmnopqrstuv",
        name: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
      }),
    ).toBeNull();
  });
});
