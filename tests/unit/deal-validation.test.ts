import { describe, expect, it } from "vitest";
import { dealFormSchema, dealFiltersSchema } from "@/validations/deal";

function baseFields() {
  return {
    name: "Website-Relaunch",
    companyId: "company-1",
    service: "WEBSITE",
    valueCents: "15000",
  };
}

describe("dealFormSchema - required fields", () => {
  it("rejects a deal without a name", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a deal without a company - Company ist Pflicht, anders als bei Lead", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), companyId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a deal without a service/Leistung", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), service: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a deal without a value", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), valueCents: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a deal with only the required fields, Contact/Lead/Probability stay optional", () => {
    const result = dealFormSchema.safeParse(baseFields());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contactId).toBeUndefined();
      expect(result.data.leadId).toBeUndefined();
      expect(result.data.probability).toBeUndefined();
    }
  });
});

describe("dealFormSchema - money (Integer-Cent-Strategie, siehe src/lib/money.ts)", () => {
  it("converts a Euro string to integer cents, never a float", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), valueCents: "150,50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.valueCents).toBe(15050);
      expect(Number.isInteger(result.data.valueCents)).toBe(true);
    }
  });

  it("rejects a non-numeric value", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), valueCents: "nicht-numerisch" });
    expect(result.success).toBe(false);
  });
});

describe("dealFormSchema - probability (0-100, optional, serverseitig validiert)", () => {
  it("accepts a probability within range", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), probability: "50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.probability).toBe(50);
  });

  it("rejects a probability above 100", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), probability: "101" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative probability", () => {
    const result = dealFormSchema.safeParse({ ...baseFields(), probability: "-1" });
    expect(result.success).toBe(false);
  });

  it("leaves probability undefined when not provided - no forecast is built from it in this phase", () => {
    const result = dealFormSchema.safeParse(baseFields());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.probability).toBeUndefined();
  });
});

describe("dealFiltersSchema", () => {
  it("defaults to sort=updatedAt, direction=desc when nothing is specified", () => {
    const filters = dealFiltersSchema.parse({});
    expect(filters.sort).toBe("updatedAt");
    expect(filters.direction).toBe("desc");
  });

  it("parses a value range filter from Cent-URL-parameters", () => {
    const filters = dealFiltersSchema.parse({ valueMinCents: "10000", valueMaxCents: "50000" });
    expect(filters.valueMinCents).toBe(10000);
    expect(filters.valueMaxCents).toBe(50000);
  });
});
