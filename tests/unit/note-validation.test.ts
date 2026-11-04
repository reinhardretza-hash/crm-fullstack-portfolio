import { describe, expect, it } from "vitest";
import { noteFormSchema } from "@/validations/note";

describe("noteFormSchema", () => {
  it("accepts a note for a company", () => {
    expect(noteFormSchema.safeParse({ content: "Notiz", companyId: "company-1" }).success).toBe(
      true,
    );
  });

  it("accepts a note for a contact", () => {
    expect(noteFormSchema.safeParse({ content: "Notiz", contactId: "contact-1" }).success).toBe(
      true,
    );
  });

  it("rejects a note with no target at all", () => {
    expect(noteFormSchema.safeParse({ content: "Notiz" }).success).toBe(false);
  });

  it("rejects a note with BOTH a company and a contact target", () => {
    expect(
      noteFormSchema.safeParse({ content: "Notiz", companyId: "company-1", contactId: "contact-1" })
        .success,
    ).toBe(false);
  });

  it("rejects empty content", () => {
    expect(noteFormSchema.safeParse({ content: "", companyId: "company-1" }).success).toBe(false);
  });
});
