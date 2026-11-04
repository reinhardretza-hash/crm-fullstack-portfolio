import { describe, expect, it } from "vitest";
import { createTagFormSchema, renameTagFormSchema } from "@/validations/tag";
import { normalizeTagName } from "@/lib/normalize";

describe("createTagFormSchema / renameTagFormSchema", () => {
  it("rejects an empty name", () => {
    expect(createTagFormSchema.safeParse({ name: "" }).success).toBe(false);
    expect(renameTagFormSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name longer than 60 characters", () => {
    expect(createTagFormSchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
  });

  it("accepts a normal tag name", () => {
    expect(createTagFormSchema.safeParse({ name: "Handwerk" }).success).toBe(true);
  });
});

describe("normalizeTagName - Grundlage für Umbenennungs-Konflikterkennung", () => {
  it("treats differently-cased names as the same normalized name", () => {
    expect(normalizeTagName("Software")).toBe(normalizeTagName("SOFTWARE"));
    expect(normalizeTagName("Software")).toBe(normalizeTagName("software"));
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeTagName("Handwerk   Betrieb")).toBe(normalizeTagName("Handwerk Betrieb"));
  });

  it("detects a rename that would collide with an existing different tag", () => {
    const existingTags = ["software", "handwerk"];
    const renamedTo = normalizeTagName("Software");
    expect(existingTags.includes(renamedTo)).toBe(true);
  });
});
