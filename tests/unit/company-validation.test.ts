import { describe, expect, it } from "vitest";
import { companyFormSchema } from "@/validations/company";

const validInput = {
  name: "Müller Elektrotechnik GmbH",
  website: "mueller-elektro.de",
  industry: "Elektrotechnik",
  phone: "202 555 0101",
  email: "info@mueller-elektro.invalid",
  street: "Musterstraße 1",
  postalCode: "10115",
  city: "Berlin",
  country: "Deutschland",
  employeeCount: "12",
  companySize: "SMALL",
  description: "Ein Beispielunternehmen.",
  status: "PROSPECT",
  source: "LINKEDIN",
  assignedUserId: "",
  needs: ["WEBSITE", "SEO"],
  tags: ["Handwerk", "Interessant"],
};

describe("companyFormSchema", () => {
  it("accepts a fully valid company", () => {
    const result = companyFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("requires a non-empty name", () => {
    const result = companyFormSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid website", () => {
    const result = companyFormSchema.safeParse({ ...validInput, website: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = companyFormSchema.safeParse({ ...validInput, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown company size enum value", () => {
    const result = companyFormSchema.safeParse({ ...validInput, companySize: "GIGANTIC" });
    expect(result.success).toBe(false);
  });

  it("defaults status to PROSPECT when omitted", () => {
    const { status, ...withoutStatus } = validInput;
    void status;
    const result = companyFormSchema.parse(withoutStatus);
    expect(result.status).toBe("PROSPECT");
  });

  it("allows a company without website/email/needs/tags (all optional)", () => {
    const result = companyFormSchema.safeParse({ name: "Minimal GmbH" });
    expect(result.success).toBe(true);
  });

  it("normalizes an empty employeeCount to undefined instead of NaN", () => {
    const result = companyFormSchema.parse({ ...validInput, employeeCount: "" });
    expect(result.employeeCount).toBeUndefined();
  });
});
