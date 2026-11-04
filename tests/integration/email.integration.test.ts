import { randomUUID } from "node:crypto";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
vi.mock("server-only", () => ({}));
const smtp = vi.hoisted(() => ({
  sendSmtpMail: vi.fn(),
  getSmtpConfig: vi.fn(),
  verifySmtp: vi.fn(),
}));
vi.mock("@/modules/email/smtp", () => smtp);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
let sessionUserId: string | null = null;
vi.mock("@/server/rbac", () => ({
  requireUser: async () => {
    if (!sessionUserId) throw new Error("AUTH_REQUIRED");
    return prisma.user.findUniqueOrThrow({ where: { id: sessionUserId } });
  },
}));
import { sendEmail } from "@/modules/email/service";
import { getEmailById, listEmails, listContextEmails } from "@/modules/email/queries";
import { sendEmailAction, testSmtpAction } from "@/modules/email/actions";
import { emailFiltersSchema } from "@/validations/email";
import { EmailError } from "@/modules/email/errors";

let companyId: string, contactId: string, leadId: string, dealId: string;
function input(extra: Record<string, unknown> = {}) {
  return {
    idempotencyKey: randomUUID(),
    toEmail: "recipient@example.invalid",
    subject: "Email integration fixture",
    textBody: "Plain text\n<script>not executed</script>",
    ...extra,
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  smtp.getSmtpConfig.mockReturnValue({ fromEmail: "sender@example.invalid", fromName: "CRM" });
  smtp.sendSmtpMail.mockResolvedValue("<fixture@example.invalid>");
  smtp.verifySmtp.mockResolvedValue(undefined);
  const user = await prisma.user.create({
    data: {
      email: `${randomUUID()}@example.invalid`,
      passwordHash: randomUUID(),
      firstName: "Email",
      lastName: "Tester",
      role: "USER",
    },
  });
  sessionUserId = user.id;
  const company = await prisma.company.create({ data: { name: "Email Company" } });
  companyId = company.id;
  const contact = await prisma.contact.create({
    data: {
      firstName: "Email",
      lastName: "Contact",
      email: "recipient@example.invalid",
      companyId,
    },
  });
  contactId = contact.id;
  const pipeline = await prisma.pipeline.create({ data: { name: "Email Pipeline" } });
  const stage = await prisma.pipelineStage.create({
    data: { pipelineId: pipeline.id, name: "Open", position: 1 },
  });
  const lead = await prisma.lead.create({
    data: { title: "Email Lead", companyId, contactId, pipelineId: pipeline.id, stageId: stage.id },
  });
  leadId = lead.id;
  const deal = await prisma.deal.create({
    data: { name: "Email Deal", companyId, contactId, leadId, service: "WEBSITE", valueCents: 100 },
  });
  dealId = deal.id;
});
describe("outbound email with real PostgreSQL", () => {
  it("persists SENT with all context relations, Activity, and limited Audit", async () => {
    const mail = await sendEmail(sessionUserId!, input({ dealId }));
    expect(mail).toMatchObject({
      status: "SENT",
      direction: "OUTBOUND",
      companyId,
      contactId,
      leadId,
      dealId,
      sentByUserId: sessionUserId,
      providerMessageId: "<fixture@example.invalid>",
    });
    expect(mail.sentAt).not.toBeNull();
    expect(mail.failedAt).toBeNull();
    const activity = await prisma.activity.findFirstOrThrow({ where: { type: "EMAIL_SENT" } });
    expect(activity).toMatchObject({ companyId, contactId, leadId, dealId });
    expect(activity.metadata).toMatchObject({
      toEmail: mail.toEmail,
      subject: mail.subject,
      status: "SENT",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "EMAIL_SENT" } });
    expect(audit.metadata).toEqual({
      emailMessageId: mail.id,
      status: "SENT",
      companyId,
      contactId,
      leadId,
      dealId,
    });
    expect(JSON.stringify(audit.metadata)).not.toContain(mail.textBody);
  });
  it.each(["contactId", "companyId", "leadId", "dealId"] as const)(
    "supports %s context",
    async (key) => {
      const ids = { contactId, companyId, leadId, dealId };
      const mail = await sendEmail(sessionUserId!, input({ [key]: ids[key] }));
      expect(mail[key]).toBe(ids[key]);
      expect((await listContextEmails({ [key]: ids[key] })).map((m) => m.id)).toContain(mail.id);
    },
  );
  it("allows changing the recipient without changing context", async () => {
    const mail = await sendEmail(
      sessionUserId!,
      input({ contactId, toEmail: "OTHER@EXAMPLE.INVALID" }),
    );
    expect(mail.toEmail).toBe("other@example.invalid");
    expect(mail.contactId).toBe(contactId);
  });
  it.each([
    ["EAUTH", "SMTP_AUTH_FAILED"],
    ["EENVELOPE", "RECIPIENT_REJECTED"],
    ["ECONNREFUSED", "SMTP_CONNECTION_FAILED"],
  ])("persists sanitized %s failure", async (code, expected) => {
    const secret = randomUUID();
    smtp.sendSmtpMail.mockRejectedValue({ code, message: secret, response: secret, stack: secret });
    const mail = await sendEmail(sessionUserId!, input({ contactId }));
    expect(mail.status).toBe("FAILED");
    expect(mail.errorCode).toBe(expected);
    expect(mail.errorMessage).not.toContain(secret);
    expect(mail.failedAt).not.toBeNull();
    expect(mail.sentAt).toBeNull();
    expect(await prisma.activity.count({ where: { type: "EMAIL_FAILED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "EMAIL_FAILED" } })).toBe(1);
  });
  it("does not reserve a message with invalid or missing SMTP config", async () => {
    smtp.getSmtpConfig.mockImplementation(() => {
      throw new EmailError("SMTP_NOT_CONFIGURED");
    });
    await expect(sendEmail(sessionUserId!, input())).rejects.toThrow("nicht konfiguriert");
    expect(await prisma.emailMessage.count()).toBe(0);
    expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
  });
  it("prevents concurrent double submit", async () => {
    const request = input({ leadId });
    const results = await Promise.all([
      sendEmail(sessionUserId!, request),
      sendEmail(sessionUserId!, request),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
    expect(await prisma.emailMessage.count()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "EMAIL_SENT" } })).toBe(1);
  });
  it("does not resend FAILED on replay", async () => {
    smtp.sendSmtpMail.mockRejectedValue({ code: "EAUTH" });
    const request = input();
    const mail = await sendEmail(sessionUserId!, request);
    expect((await sendEmail(sessionUserId!, request)).id).toBe(mail.id);
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
  });
  it("rejects changed payload for an existing token", async () => {
    const request = input();
    await sendEmail(sessionUserId!, request);
    await expect(sendEmail(sessionUserId!, { ...request, subject: "changed" })).rejects.toThrow(
      "andere Nachricht",
    );
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
  });
  it("rejects another user's token without exposing or sending the mail", async () => {
    const request = input();
    await sendEmail(sessionUserId!, request);
    const other = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        passwordHash: randomUUID(),
        firstName: "Other",
        lastName: "User",
      },
    });
    await expect(sendEmail(other.id, request)).rejects.toThrow("Berechtigung");
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
  });
  it("serializes the send limit across six concurrent requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => sendEmail(sessionUserId!, input())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(smtp.sendSmtpMail).toHaveBeenCalledTimes(5);
    expect(await prisma.emailMessage.count()).toBe(5);
  });
  it("does not count old attempts", async () => {
    for (let i = 0; i < 5; i++) await sendEmail(sessionUserId!, input());
    await prisma.emailMessage.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
    expect((await sendEmail(sessionUserId!, input())).status).toBe("SENT");
  });
  it("rejects mismatched Contact and Company before SMTP", async () => {
    const other = await prisma.company.create({ data: { name: "Other" } });
    await expect(
      sendEmail(sessionUserId!, input({ contactId, companyId: other.id })),
    ).rejects.toThrow("gehören nicht zusammen");
    expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
  });
  it("rejects inconsistent Lead or Deal relations", async () => {
    const other = await prisma.contact.create({ data: { firstName: "Other", companyId } });
    await expect(sendEmail(sessionUserId!, input({ leadId, contactId: other.id }))).rejects.toThrow(
      "gehören nicht zusammen",
    );
    await expect(sendEmail(sessionUserId!, input({ dealId, contactId: other.id }))).rejects.toThrow(
      "gehören nicht zusammen",
    );
  });
  it("rejects soft-deleted context", async () => {
    await prisma.contact.update({ where: { id: contactId }, data: { deletedAt: new Date() } });
    await expect(sendEmail(sessionUserId!, input({ leadId }))).rejects.toThrow("gelöscht");
    expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
  });
  it("rejects inactive sender", async () => {
    await prisma.user.update({ where: { id: sessionUserId! }, data: { isActive: false } });
    await expect(sendEmail(sessionUserId!, input())).rejects.toThrow("Berechtigung");
  });
  it("blocks unauthenticated query and direct email ID access", async () => {
    const mail = await sendEmail(sessionUserId!, input());
    sessionUserId = null;
    await expect(getEmailById(mail.id)).rejects.toThrow("AUTH_REQUIRED");
    await expect(listEmails({}, { page: 1, pageSize: 25 })).rejects.toThrow("AUTH_REQUIRED");
  });
  it("returns no record for an unknown authenticated email ID", async () =>
    expect(await getEmailById(randomUUID())).toBeNull());
  it("supports contact/company search, status, sender, inclusive date and pagination", async () => {
    const mail = await sendEmail(sessionUserId!, input({ dealId }));
    await prisma.emailMessage.update({
      where: { id: mail.id },
      data: { createdAt: new Date("2026-09-30T22:15:00Z") },
    });
    for (const q of [
      "Email Company",
      "Contact",
      "recipient@example.invalid",
      "integration fixture",
    ]) {
      expect((await listEmails({ q }, { page: 1, pageSize: 25 })).totalCount).toBe(1);
    }
    expect(
      (
        await listEmails(
          emailFiltersSchema.parse({
            status: "SENT",
            userId: sessionUserId,
            dateFrom: "2026-10-01",
            dateTo: "2026-10-01",
          }),
          { page: 1, pageSize: 25 },
        )
      ).totalCount,
    ).toBe(1);
    expect((await listEmails({ status: "FAILED" }, { page: 1, pageSize: 25 })).totalCount).toBe(0);
    await prisma.emailMessage.createMany({
      data: Array.from({ length: 26 }, () => ({
        status: "SENT" as const,
        idempotencyKey: randomUUID(),
        requestHash: randomUUID(),
        fromEmail: "a@example.invalid",
        toEmail: "b@example.invalid",
        subject: "Page fixture",
        textBody: "text",
        sentByUserId: sessionUserId!,
      })),
    });
    expect((await listEmails({}, { page: 1, pageSize: 25 })).messages).toHaveLength(25);
    expect((await listEmails({}, { page: 2, pageSize: 25 })).messages).toHaveLength(2);
  });
  it("retains SENDING and never resends after SMTP success plus DB failure", async () => {
    const original = prisma.$transaction.bind(prisma);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const transaction = vi
      .spyOn(prisma, "$transaction")
      .mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error(randomUUID()));
    const request = input();
    try {
      const result = await sendEmail(sessionUserId!, request);
      expect(result.status).toBe("SENDING");
    } finally {
      transaction.mockRestore();
    }
    const replay = await sendEmail(sessionUserId!, request);
    expect(replay.status).toBe("SENDING");
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"EMAIL_FINALIZATION_FAILED"'),
    );
    log.mockRestore();
  });
  it("server action validates header injection and never invokes SMTP", async () => {
    const fields = input({ subject: "Header\nBcc:attacker@example.invalid" });
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, String(v));
    expect((await sendEmailAction({ error: null }, form)).error).toContain("Steuerzeichen");
    expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
  });
  it("only OWNER may test SMTP, and verify sends no email", async () => {
    await expect(testSmtpAction()).rejects.toThrow("Berechtigung");
    await prisma.user.update({ where: { id: sessionUserId! }, data: { role: "OWNER" } });
    expect((await testSmtpAction()).success).toBe(true);
    expect(smtp.verifySmtp).toHaveBeenCalledOnce();
    expect(smtp.sendSmtpMail).not.toHaveBeenCalled();
  });
  it("persists an active plaintext template", async () => {
    const template = await prisma.emailTemplate.create({
      data: { name: "Simple", subject: "Hello", body: "Editable plain text" },
    });
    expect(template.isActive).toBe(true);
  });
});

it.each(["ETIMEDOUT", "ESOCKETTIMEDOUT", "ESOCKET", "unclassified"])(
  "retains ambiguous %s without replaying SMTP",
  async (code) => {
    smtp.sendSmtpMail.mockRejectedValue({ code, message: "PRIVATE_PROVIDER_DETAIL" });
    const request = input();
    const mail = await sendEmail(sessionUserId!, request);
    expect(mail.status).toBe("SENDING");
    expect(mail.failedAt).toBeNull();
    expect(mail.errorMessage).not.toContain("PRIVATE_PROVIDER_DETAIL");
    expect((await sendEmail(sessionUserId!, request)).id).toBe(mail.id);
    expect(smtp.sendSmtpMail).toHaveBeenCalledOnce();
    expect(await prisma.auditLog.count({ where: { action: "EMAIL_FAILED" } })).toBe(0);
  },
);
