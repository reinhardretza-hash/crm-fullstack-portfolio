import { describe, expect, it } from "vitest";
import { settingsFormSchema } from "@/validations/settings";

function baseFields() {
  return {
    companyName: "RDEvolution GbR",
    timezone: "Europe/Berlin",
    currency: "EUR",
    defaultPipelineId: "pipeline-1",
    expectedVersion: "1",
  };
}

describe("settingsFormSchema", () => {
  it("accepts valid input", () => {
    const result = settingsFormSchema.safeParse(baseFields());
    expect(result.success).toBe(true);
  });

  it("rejects a missing company name", () => {
    expect(settingsFormSchema.safeParse({ ...baseFields(), companyName: "" }).success).toBe(false);
  });

  it("rejects a missing timezone", () => {
    expect(settingsFormSchema.safeParse({ ...baseFields(), timezone: "" }).success).toBe(false);
  });

  it("rejects a missing currency", () => {
    expect(settingsFormSchema.safeParse({ ...baseFields(), currency: "" }).success).toBe(false);
  });

  it("rejects a missing default pipeline", () => {
    expect(
      settingsFormSchema.safeParse({ ...baseFields(), defaultPipelineId: "" }).success,
    ).toBe(false);
  });

  it("rejects a non-numeric expectedVersion", () => {
    expect(
      settingsFormSchema.safeParse({ ...baseFields(), expectedVersion: "not-a-number" }).success,
    ).toBe(false);
  });
});
