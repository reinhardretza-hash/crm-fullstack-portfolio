import { describe, expect, it } from "vitest";
import { contactFormSchema } from "@/validations/contact";

describe("contactFormSchema", () => {
  it("accepts a contact with both first and last name", () => {
    const result = contactFormSchema.safeParse({ firstName: "Max", lastName: "Mustermann" });
    expect(result.success).toBe(true);
  });

  it("accepts a contact with only a first name", () => {
    const result = contactFormSchema.safeParse({ firstName: "Max" });
    expect(result.success).toBe(true);
  });

  it("accepts a contact with only a last name", () => {
    const result = contactFormSchema.safeParse({ lastName: "Mustermann" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty contact (no name at all) - keine leeren Kontakte", () => {
    const result = contactFormSchema.safeParse({ jobTitle: "Geschäftsführer" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only names as effectively empty", () => {
    const result = contactFormSchema.safeParse({ firstName: "   ", lastName: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid LinkedIn URL", () => {
    const result = contactFormSchema.safeParse({
      firstName: "Max",
      linkedinUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = contactFormSchema.safeParse({ firstName: "Max", email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("defaults status to NEW", () => {
    const result = contactFormSchema.parse({ firstName: "Max" });
    expect(result.status).toBe("NEW");
  });
});
