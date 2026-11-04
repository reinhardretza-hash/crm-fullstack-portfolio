import { randomUUID, createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { mergeEmailContext } from "@/modules/email/context";
import { classifySmtpError } from "@/modules/email/errors";
import { assertEmailReplay, emailRequestHash, isEmailRateLimited } from "@/modules/email/policy";
import { hasPermission, canAccessAdministration } from "@/server/permissions";
describe("email policies", () => {
  it("preserves Phase-7 idempotency hashes for ordinary emails", () => {
    const input = {
      idempotencyKey: randomUUID(),
      toEmail: "recipient@example.invalid",
      subject: "Subject",
      textBody: "Body",
    };
    const legacy = createHash("sha256")
      .update(
        JSON.stringify([
          input.toEmail,
          null,
          input.subject,
          input.textBody,
          null,
          null,
          null,
          null,
        ]),
      )
      .digest("hex");
    expect(emailRequestHash(input)).toBe(legacy);
    expect(emailRequestHash({ ...input, quoteId: "quote", quoteVersion: 1 })).not.toBe(legacy);
  });
  it("infers related IDs without overwriting explicit IDs", () =>
    expect(mergeEmailContext({ contactId: "c" }, { contactId: "c", companyId: "o" })).toEqual({
      contactId: "c",
      companyId: "o",
      leadId: undefined,
      dealId: undefined,
    }));
  it.each(["contactId", "companyId", "leadId", "dealId"] as const)(
    "rejects inconsistent %s",
    (key) =>
      expect(() => mergeEmailContext({ [key]: "a" }, { [key]: "b" })).toThrow(
        "gehören nicht zusammen",
      ),
  );
  it.each(["OWNER", "ADMIN", "USER"] as const)("allows %s to send", (role) =>
    expect(hasPermission({ role }, "EMAIL_SEND")).toBe(true),
  );
  it("does not grant administration to USER", () =>
    expect(canAccessAdministration({ role: "USER" })).toBe(false));
  it("rejects cross-user idempotency replay", () =>
    expect(() => assertEmailReplay({ sentByUserId: "a", requestHash: "h" }, "b", "h")).toThrow());
  it("rejects changed content replay", () =>
    expect(() => assertEmailReplay({ sentByUserId: "a", requestHash: "h" }, "a", "new")).toThrow(
      "andere Nachricht",
    ));
  it("reuses identical content independently of its send key", () => {
    const data = {
      idempotencyKey: randomUUID(),
      toEmail: "a@example.com",
      subject: "s",
      textBody: "t",
    };
    expect(emailRequestHash(data)).toBe(
      emailRequestHash({ ...data, idempotencyKey: randomUUID() }),
    );
    expect(emailRequestHash(data)).not.toBe(emailRequestHash({ ...data, textBody: "changed" }));
  });
  it("limits after five attempts", () => {
    expect(isEmailRateLimited(4)).toBe(false);
    expect(isEmailRateLimited(5)).toBe(true);
  });
  it.each([
    ["EAUTH", "SMTP_AUTH_FAILED"],
    ["EENVELOPE", "RECIPIENT_REJECTED"],
    ["ETIMEDOUT", "TIMEOUT"],
    ["ECONNREFUSED", "SMTP_CONNECTION_FAILED"],
    ["unexpected", "UNKNOWN"],
  ])("sanitizes %s", (code, expected) => {
    const secret = randomUUID();
    const error = classifySmtpError({ code, message: secret, stack: secret, response: secret });
    expect(error.code).toBe(expected);
    expect(error.message).not.toContain(secret);
  });
});
