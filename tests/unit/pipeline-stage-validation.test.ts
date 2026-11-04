import { describe, expect, it } from "vitest";
import { pipelineStageFormSchemaRefined } from "@/validations/pipeline-admin";

function baseFields() {
  return { name: "Angebot", expectedVersion: "1" };
}

describe("pipelineStageFormSchemaRefined", () => {
  it("rejects a stage marked as both Won and Lost", () => {
    const result = pipelineStageFormSchemaRefined.safeParse({
      ...baseFields(),
      isWonStage: "on",
      isLostStage: "on",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a stage marked only as Won", () => {
    const result = pipelineStageFormSchemaRefined.safeParse({
      ...baseFields(),
      isWonStage: "on",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isWonStage).toBe(true);
      expect(result.data.isLostStage).toBe(false);
    }
  });

  it("accepts a stage marked as neither Won nor Lost", () => {
    const result = pipelineStageFormSchemaRefined.safeParse(baseFields());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isWonStage).toBe(false);
      expect(result.data.isLostStage).toBe(false);
    }
  });

  it("rejects a probability outside 0-100", () => {
    expect(
      pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), probability: "101" }).success,
    ).toBe(false);
    expect(
      pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), probability: "-1" }).success,
    ).toBe(false);
  });

  it("accepts a probability within range", () => {
    const result = pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), probability: "50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.probability).toBe(50);
  });

  it("rejects an invalid color format", () => {
    expect(
      pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), color: "blue" }).success,
    ).toBe(false);
  });

  it("accepts a valid #RRGGBB color", () => {
    const result = pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), color: "#FF00AA" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), name: "" }).success).toBe(
      false,
    );
  });
});

describe("strict probability regression", () => {
  it.each(["1.5", "10junk", "invalid"])("rejects %s", (probability) => {
    expect(pipelineStageFormSchemaRefined.safeParse({ ...baseFields(), probability }).success).toBe(
      false,
    );
  });
});
