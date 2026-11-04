import { describe, expect, it } from "vitest";
import {
  extractDomain,
  normalizeEmail,
  normalizeLinkedinUrl,
  normalizePhone,
  normalizeTagName,
  normalizeUrl,
} from "@/lib/normalize";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Max@Example.COM ")).toBe("max@example.com");
  });
});

describe("normalizePhone", () => {
  it("strips formatting characters", () => {
    expect(normalizePhone("+1 (202) 555-0101")).toBe("+12025550101");
  });

  it("keeps a leading plus but strips everything else", () => {
    expect(normalizePhone("001 202 555 0101")).toBe("0012025550101");
  });
});

describe("normalizeUrl", () => {
  it("adds https:// when no scheme is given", () => {
    expect(normalizeUrl("example.de")).toBe("https://example.de/");
  });

  it("keeps an existing https:// URL", () => {
    expect(normalizeUrl("https://example.de/path")).toBe("https://example.de/path");
  });

  it("rejects javascript: URLs", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects data: URLs", () => {
    expect(() => normalizeUrl("data:text/html,<script>alert(1)</script>")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => normalizeUrl("  ")).toThrow();
  });
});

describe("extractDomain", () => {
  it("strips the www. prefix", () => {
    expect(extractDomain("https://www.example.de/path")).toBe("example.de");
  });

  it("is case-insensitive", () => {
    expect(extractDomain("HTTPS://EXAMPLE.DE")).toBe("example.de");
  });

  it("treats example.de and https://www.example.de as the same domain", () => {
    expect(extractDomain("example.de")).toBe(extractDomain("https://www.example.de"));
  });
});

describe("normalizeLinkedinUrl", () => {
  it("strips query params and trailing slash", () => {
    expect(normalizeLinkedinUrl("linkedin.com/in/max-mustermann/?x=1")).toBe(
      "https://linkedin.com/in/max-mustermann",
    );
  });

  it("treats www and non-www as the same profile", () => {
    expect(normalizeLinkedinUrl("https://www.linkedin.com/in/max-mustermann")).toBe(
      normalizeLinkedinUrl("linkedin.com/in/max-mustermann"),
    );
  });
});

describe("normalizeTagName", () => {
  it("collapses different casings to the same normalized name", () => {
    expect(normalizeTagName("Handwerk")).toBe(normalizeTagName("handwerk"));
    expect(normalizeTagName("HANDWERK")).toBe(normalizeTagName("handwerk"));
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeTagName("  Software   Bedarf  ")).toBe("software bedarf");
  });
});
