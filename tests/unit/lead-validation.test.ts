import { describe, expect, it } from "vitest";
import { leadFormSchema, stageMoveSchema } from "@/validations/lead";

const baseInput = {
  title: "Digitalisierung interner Prozesse",
  companyId: "company-1",
  pipelineId: "pipeline-1",
  stageId: "stage-1",
};

describe("leadFormSchema", () => {
  it("accepts a lead with a company but no contact", () => {
    expect(leadFormSchema.safeParse(baseInput).success).toBe(true);
  });

  it("accepts a lead with a contact but no company", () => {
    const { companyId, ...rest } = baseInput;
    void companyId;
    expect(leadFormSchema.safeParse({ ...rest, contactId: "contact-1" }).success).toBe(true);
  });

  it("accepts a lead with both a company and a contact", () => {
    expect(leadFormSchema.safeParse({ ...baseInput, contactId: "contact-1" }).success).toBe(true);
  });

  it("rejects a lead with neither a company nor a contact", () => {
    const { companyId, ...rest } = baseInput;
    void companyId;
    expect(leadFormSchema.safeParse(rest).success).toBe(false);
  });

  it("requires a title", () => {
    expect(leadFormSchema.safeParse({ ...baseInput, title: "" }).success).toBe(false);
  });

  it("requires a pipelineId and stageId", () => {
    expect(leadFormSchema.safeParse({ ...baseInput, pipelineId: "" }).success).toBe(false);
    expect(leadFormSchema.safeParse({ ...baseInput, stageId: "" }).success).toBe(false);
  });

  it("defaults priority to NORMAL", () => {
    const result = leadFormSchema.parse(baseInput);
    expect(result.priority).toBe("NORMAL");
  });

  it("converts a euro expectedValueCents input into cents", () => {
    const result = leadFormSchema.parse({ ...baseInput, expectedValueCents: "15000" });
    expect(result.expectedValueCents).toBe(1_500_000);
  });

  describe("probability validation", () => {
    it("accepts 0", () => {
      expect(leadFormSchema.safeParse({ ...baseInput, probability: "0" }).success).toBe(true);
    });

    it("accepts 100", () => {
      expect(leadFormSchema.safeParse({ ...baseInput, probability: "100" }).success).toBe(true);
    });

    it("rejects a negative probability", () => {
      expect(leadFormSchema.safeParse({ ...baseInput, probability: "-1" }).success).toBe(false);
    });

    it("rejects a probability above 100", () => {
      expect(leadFormSchema.safeParse({ ...baseInput, probability: "101" }).success).toBe(false);
    });
  });
});

describe("stageMoveSchema", () => {
  it("accepts a valid stage move payload", () => {
    expect(
      stageMoveSchema.safeParse({ leadId: "lead-1", toStageId: "stage-2", expectedVersion: 1 })
        .success,
    ).toBe(true);
  });

  it("rejects a missing leadId", () => {
    expect(stageMoveSchema.safeParse({ toStageId: "stage-2", expectedVersion: 1 }).success).toBe(
      false,
    );
  });

  it("rejects a non-positive expectedVersion", () => {
    expect(
      stageMoveSchema.safeParse({ leadId: "lead-1", toStageId: "stage-2", expectedVersion: 0 })
        .success,
    ).toBe(false);
  });
});
