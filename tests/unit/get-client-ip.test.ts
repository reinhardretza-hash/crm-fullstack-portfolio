import { describe, expect, it } from "vitest";
import { getClientIp } from "@/modules/auth/get-client-ip";

function requestWithForwardedFor(value: string | null) {
  const headers = new Headers();
  if (value !== null) {
    headers.set("x-forwarded-for", value);
  }
  return new Request("http://localhost", { headers });
}

describe("getClientIp", () => {
  it("returns the placeholder when no header is present (local dev without a proxy)", () => {
    expect(getClientIp(requestWithForwardedFor(null))).toBe("unknown-origin");
  });

  it("returns the single value when exactly one hop is present", () => {
    expect(getClientIp(requestWithForwardedFor("203.0.113.5"))).toBe("203.0.113.5");
  });

  it("trusts the RIGHTMOST value, not the client-supplied leftmost one", () => {
    // Ein Client könnte selbst "X-Forwarded-For: 9.9.9.9" mitsenden; unser
    // Nginx hängt seinen eigenen, echten Beobachtungswert rechts an. Nur der
    // rechte Wert darf als Client-IP verwendet werden.
    const spoofedThenReal = "9.9.9.9, 203.0.113.5";
    expect(getClientIp(requestWithForwardedFor(spoofedThenReal))).toBe("203.0.113.5");
  });

  it("trims whitespace around the trusted value", () => {
    expect(getClientIp(requestWithForwardedFor("9.9.9.9 ,  203.0.113.5  "))).toBe("203.0.113.5");
  });
});
