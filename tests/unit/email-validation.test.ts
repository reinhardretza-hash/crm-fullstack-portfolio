import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { emailSendSchema, emailFiltersSchema, recipientSchema } from "@/validations/email";
const valid = () => ({
  idempotencyKey: randomUUID(),
  toEmail: "USER@EXAMPLE.COM",
  subject: "Hello",
  textBody: "Text",
});
describe("email input", () => {
  it("normalizes a single recipient", () =>
    expect(emailSendSchema.parse(valid()).toEmail).toBe("user@example.com"));
  it.each([
    "a@example.com\r\nBcc:evil@example.com",
    "a@example.com,b@example.com",
    "Name <a@example.com>",
    "a@example.com\u0000",
    "invalid",
  ])("rejects recipient injection %s", (value) =>
    expect(recipientSchema.safeParse(value).success).toBe(false),
  );
  it.each(["", " ", "hello\r\nBcc:other@example.com", "hello\nthere", "x".repeat(201)])(
    "rejects invalid subject",
    (subject) => expect(emailSendSchema.safeParse({ ...valid(), subject }).success).toBe(false),
  );
  it.each(["", " ", "x".repeat(50_001)])("rejects invalid body", (textBody) =>
    expect(emailSendSchema.safeParse({ ...valid(), textBody }).success).toBe(false),
  );
  it("permits multiline plaintext and treats HTML as text", () =>
    expect(
      emailSendSchema.parse({ ...valid(), textBody: "<script>alert(1)</script>\nSecond line" })
        .textBody,
    ).toContain("<script>"));
  it("rejects forged request keys", () =>
    expect(emailSendSchema.safeParse({ ...valid(), idempotencyKey: "bad" }).success).toBe(false));
  it("removes empty context IDs", () =>
    expect(emailSendSchema.parse({ ...valid(), contactId: "" }).contactId).toBeUndefined());
  it("includes complete Berlin calendar days", () => {
    const filters = emailFiltersSchema.parse({ dateFrom: "2026-10-01", dateTo: "2026-10-01" });
    expect(filters.dateFrom?.toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(filters.dateTo?.toISOString()).toBe("2026-10-01T21:59:59.999Z");
  });
  it.each([
    { dateFrom: "2026-02-30" },
    { dateTo: "bad" },
    { dateFrom: "2026-10-02", dateTo: "2026-10-01" },
    { status: "INBOX" },
  ])("rejects invalid filters", (input) =>
    expect(emailFiltersSchema.safeParse(input).success).toBe(false),
  );
});
