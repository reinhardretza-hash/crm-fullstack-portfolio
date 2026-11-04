import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(),
  verify: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("crm-nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));
import { getSmtpConfig, isSmtpConfigured, sendSmtpMail, verifySmtp } from "@/modules/email/smtp";
const mail = {
  fromEmail: "sender@example.com",
  fromName: null,
  toEmail: "receiver@example.com",
  toName: null,
  subject: "hello",
  textBody: "plain text",
};
beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries({
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "fixture",
    SMTP_PASSWORD: randomUUID(),
    SMTP_FROM_EMAIL: "sender@example.com",
    SMTP_FROM_NAME: "",
    SMTP_REPLY_TO: "",
  }))
    vi.stubEnv(k, v);
  smtp.createTransport.mockReturnValue(smtp);
  smtp.sendMail.mockResolvedValue({
    accepted: [mail.toEmail],
    rejected: [],
    messageId: "<fixture@example.com>",
  });
  smtp.verify.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());
describe("SMTP adapter", () => {
  it("attaches only the supplied server-generated quote buffer with PDF MIME", async () => {
    const content = Buffer.from("%PDF-fixture");
    await sendSmtpMail({ ...mail, quoteAttachment: { filename: "ANG-2026-0001.pdf", content } });
    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ filename: "ANG-2026-0001.pdf", content, contentType: "application/pdf" }],
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
  });
  it("sends plaintext with TLS, no debug, and restricted content sources", async () => {
    expect(await sendSmtpMail(mail)).toBe("<fixture@example.com>");
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        secure: false,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      }),
    );
    expect(smtp.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: { address: mail.toEmail, name: "" }, text: mail.textBody }),
    );
    expect(smtp.close).toHaveBeenCalledOnce();
  });
  it.each([
    ["EAUTH", "SMTP_AUTH_FAILED"],
    ["EENVELOPE", "RECIPIENT_REJECTED"],
    ["ETIMEDOUT", "TIMEOUT"],
    ["ECONNREFUSED", "SMTP_CONNECTION_FAILED"],
  ])("classifies %s", async (code, expected) => {
    smtp.sendMail.mockRejectedValue({ code, message: randomUUID() });
    await expect(sendSmtpMail(mail)).rejects.toMatchObject({ code: expected });
    expect(smtp.close).toHaveBeenCalledOnce();
  });
  it("rejects nonacceptance", async () => {
    smtp.sendMail.mockResolvedValue({ accepted: [], rejected: [mail.toEmail] });
    await expect(sendSmtpMail(mail)).rejects.toMatchObject({ code: "RECIPIENT_REJECTED" });
  });
  it("verifies without sending mail", async () => {
    await verifySmtp();
    expect(smtp.verify).toHaveBeenCalledOnce();
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });
  it("sanitizes verification auth failures", async () => {
    smtp.verify.mockRejectedValue({ code: "EAUTH", message: randomUUID() });
    await expect(verifySmtp()).rejects.toMatchObject({ code: "SMTP_AUTH_FAILED" });
  });
  it.each([
    { SMTP_SECURE: "maybe" },
    { SMTP_PORT: "587junk" },
    { SMTP_FROM_EMAIL: "bad" },
    { SMTP_FROM_NAME: "name\nBcc:bad" },
    { SMTP_PASSWORD: "" },
    { SMTP_HOST: "smtp://user:secret@host" },
  ])("fails closed on invalid environment", async (values) => {
    for (const [k, v] of Object.entries(values)) vi.stubEnv(k, v);
    expect(isSmtpConfigured()).toBe(false);
    expect(() => getSmtpConfig()).toThrow("nicht konfiguriert");
    await expect(sendSmtpMail(mail)).rejects.toMatchObject({ code: "SMTP_NOT_CONFIGURED" });
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
});
