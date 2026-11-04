import { describe, expect, it } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "@/modules/auth/hash";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password against its own hash", async () => {
    const hash = await hashPassword("a-real-password-123");
    await expect(verifyPassword("a-real-password-123", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("a-real-password-123");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("never stores the plaintext password in the hash", async () => {
    const hash = await hashPassword("a-real-password-123");
    expect(hash).not.toContain("a-real-password-123");
  });
});

describe("DUMMY_PASSWORD_HASH", () => {
  it("is a valid bcrypt hash usable for a real comparison", async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$/);
    await expect(verifyPassword("anything", DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
