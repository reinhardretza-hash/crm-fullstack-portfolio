import "server-only";
import nodemailer from "crm-nodemailer";
import { z } from "zod";
import { headerField, recipientSchema } from "@/validations/email";
import { classifySmtpError, EmailError } from "./errors";

const configSchema = z.object({
  host: z
    .string()
    .min(1)
    .max(253)
    .refine((v) => !/[\s/@:\\]/.test(v)),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.enum(["true", "false"]).transform((v) => v === "true"),
  user: z.string().min(1),
  password: z.string().min(1),
  fromEmail: recipientSchema,
  fromName: headerField.optional(),
  replyTo: recipientSchema.optional(),
});
export function getSmtpConfig() {
  const parsed = configSchema.safeParse({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    fromEmail: process.env.SMTP_FROM_EMAIL,
    fromName: process.env.SMTP_FROM_NAME || undefined,
    replyTo: process.env.SMTP_REPLY_TO || undefined,
  });
  if (!parsed.success) throw new EmailError("SMTP_NOT_CONFIGURED");
  return parsed.data;
}
export function isSmtpConfigured(): boolean {
  try {
    getSmtpConfig();
    return true;
  } catch {
    return false;
  }
}
function transport() {
  const config = getSmtpConfig();
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
}
export type OutboundMail = {
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  toName: string | null;
  subject: string;
  textBody: string;
  quoteAttachment?: { filename: string; content: Buffer };
};
export async function sendSmtpMail(mail: OutboundMail): Promise<string> {
  const client = transport();
  try {
    const result = await client.sendMail({
      from: { address: mail.fromEmail, name: mail.fromName || "" },
      to: { address: mail.toEmail, name: mail.toName || "" },
      subject: mail.subject,
      text: mail.textBody,
      attachments: mail.quoteAttachment
        ? [
            {
              filename: mail.quoteAttachment.filename,
              content: mail.quoteAttachment.content,
              contentType: "application/pdf",
            },
          ]
        : undefined,
      replyTo: getSmtpConfig().replyTo,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new EmailError("RECIPIENT_REJECTED");
    // Nur eine begrenzte Message-ID, niemals die rohe Providerantwort speichern.
    return String(result.messageId || "")
      .replace(/[\r\n]/g, "")
      .slice(0, 255);
  } catch (error) {
    throw classifySmtpError(error);
  } finally {
    client.close();
  }
}
export async function verifySmtp(): Promise<void> {
  const client = transport();
  try {
    await client.verify();
  } catch (error) {
    throw classifySmtpError(error);
  } finally {
    client.close();
  }
}
