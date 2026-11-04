import { describe, expect, it } from "vitest";
import { hashIdentifier, hashOrigin, normalizeEmail } from "@/modules/auth/identifier";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Max@Example.COM  ")).toBe("max@example.com");
  });
});

describe("hashIdentifier / hashOrigin", () => {
  it("produces a deterministic hash for the same input", () => {
    expect(hashIdentifier("max@example.com")).toBe(hashIdentifier("max@example.com"));
  });

  it("normalizes email before hashing (case/whitespace-insensitive)", () => {
    expect(hashIdentifier("Max@Example.com")).toBe(hashIdentifier(" max@example.com "));
  });

  it("produces different hashes for different emails", () => {
    expect(hashIdentifier("max@example.com")).not.toBe(hashIdentifier("erika@example.com"));
  });

  it("never contains the plaintext input", () => {
    const hash = hashIdentifier("max@example.com");
    expect(hash).not.toContain("max");
    expect(hash).not.toContain("example");
  });

  it("domain-separates identifier and origin hashing (same raw value, different domain)", () => {
    // Bewusster Test der Domain Separation: derselbe Rohwert darf unter den
    // beiden Präfixen "identifier:" und "origin:" nicht denselben Hash ergeben.
    expect(hashIdentifier("203.0.113.5")).not.toBe(hashOrigin("203.0.113.5"));
  });

  it("hashOrigin is deterministic for the same IP", () => {
    expect(hashOrigin("203.0.113.5")).toBe(hashOrigin("203.0.113.5"));
  });
});
