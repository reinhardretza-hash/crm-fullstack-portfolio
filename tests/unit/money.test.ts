import { describe, expect, it } from "vitest";
import { centsToEuro, euroToCents, formatCentsAsEuro } from "@/lib/money";

describe("euroToCents", () => {
  it("converts a whole euro amount to cents", () => {
    expect(euroToCents("15000")).toBe(1_500_000);
  });

  it("converts a comma-decimal euro amount to cents", () => {
    expect(euroToCents("150,50")).toBe(15050);
  });

  it("converts a dot-decimal euro amount to cents", () => {
    expect(euroToCents(150.5)).toBe(15050);
  });

  it("rounds instead of truncating to avoid float drift", () => {
    expect(euroToCents("10.005")).toBe(1001);
  });

  it("throws on an invalid amount", () => {
    expect(() => euroToCents("not-a-number")).toThrow();
  });
});

describe("centsToEuro / formatCentsAsEuro", () => {
  it("round-trips cents to euro correctly", () => {
    expect(centsToEuro(1_500_000)).toBe(15000);
  });

  it("formats cents as a German-locale euro string", () => {
    const formatted = formatCentsAsEuro(1_500_000);
    expect(formatted).toContain("15.000,00");
    expect(formatted).toContain("€");
  });

  it("never produces float drift for typical amounts (0.1 + 0.2 style bugs)", () => {
    const tenCents = euroToCents("0.10");
    const twentyCents = euroToCents("0.20");
    expect(tenCents + twentyCents).toBe(30);
  });
});
