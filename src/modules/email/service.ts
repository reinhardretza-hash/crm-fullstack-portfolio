import "server-only";
import { prisma } from "@/lib/prisma";
import { AppError, ForbiddenError } from "@/lib/errors";
import { requirePermission } from "@/server/permissions";
import { emailSendSchema } from "@/validations/email";
import { logActivity } from "@/modules/activity/log";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { resolveEmailContext, mergeEmailContext } from "./context";
import { assertQuoteAvailable, lockQuote, recordQuote } from "@/modules/quotes/service";
import { effectiveQuoteStatus } from "@/modules/quotes/helpers";
import { assertInvoiceAvailable, lockInvoice, recordInvoice } from "@/modules/invoices/service";
import { invoicePdfData } from "@/modules/invoices/pdf-data";
import { quotePdfData } from "@/modules/quotes/pdf-data";
import { getSmtpConfig, sendSmtpMail } from "./smtp";
import { classifySmtpError } from "./errors";
import {
  EMAIL_SEND_WINDOW_MS,
  isEmailRateLimited,
  emailRequestHash,
  assertEmailReplay,
} from "./policy";

export async function sendEmail(userId: string, rawInput: unknown) {
  const parsed = emailSendSchema.safeParse(rawInput);
  if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || "Ungültige E-Mail.");
  const input = parsed.data;
  const requestHash = emailRequestHash(input);
  const reserved = await prisma.$transaction(async (tx) => {
    // Pro Benutzer serialisiert: Rate Limit und Doppel-Submit sind prozessübergreifend sicher.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 700001))`;
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) throw new ForbiddenError();
    requirePermission(user, "EMAIL_SEND");
    const existing = await tx.emailMessage.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      assertEmailReplay(existing, userId, requestHash);
      return { message: existing, isNew: false };
    }
    const quote = input.quoteId
      ? await assertQuoteAvailable(tx, input.quoteId, input.quoteVersion || 0)
      : null;
    if (quote && effectiveQuoteStatus(quote) !== "READY")
      throw new AppError("Nur gültige, bereite Angebote können per E-Mail versendet werden.");
    const invoice = input.invoiceId
      ? await assertInvoiceAvailable(tx, input.invoiceId, input.invoiceVersion || 0)
      : null;
    if (invoice && invoice.status !== "READY")
      throw new AppError("Nur bereite Rechnungen können versendet werden.");
    const document = quote || invoice;
    const suppliedContext = {
      companyId: input.companyId,
      contactId: input.contactId,
      leadId: input.leadId,
      dealId: input.dealId,
    };
    const { context } = await resolveEmailContext(
      tx,
      document
        ? mergeEmailContext(suppliedContext, {
            companyId: document.companyId,
            contactId: document.contactId || undefined,
            dealId: document.dealId || undefined,
          })
        : suppliedContext,
    );
    const count = await tx.emailMessage.count({
      where: {
        sentByUserId: userId,
        createdAt: { gt: new Date(Date.now() - EMAIL_SEND_WINDOW_MS) },
      },
    });
    if (isEmailRateLimited(count))
      throw new AppError("Maximal fünf E-Mails pro Minute. Bitte kurz warten.");
    const smtp = getSmtpConfig();
    if (quote) {
      const changed = await tx.quote.updateMany({
        where: { id: quote.id, version: quote.version, deletedAt: null, status: "READY" },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new AppError("Angebot wurde zwischenzeitlich geändert.");
    }
    if (invoice) {
      const changed = await tx.invoice.updateMany({
        where: { id: invoice.id, version: invoice.version, deletedAt: null, status: "READY" },
        data: { version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new AppError("Rechnung wurde zwischenzeitlich geändert.");
    }
    const message = await tx.emailMessage.create({
      data: {
        ...context,
        invoiceId: invoice?.id,
        invoiceVersion: invoice ? invoice.version + 1 : null,
        quoteId: quote?.id,
        quoteVersion: quote ? quote.version + 1 : null,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        status: "SENDING",
        fromEmail: smtp.fromEmail,
        fromName: smtp.fromName,
        toEmail: input.toEmail,
        toName: input.toName,
        subject: input.subject,
        textBody: input.textBody,
        sentByUserId: userId,
      },
    });
    return {
      message,
      isNew: true,
      pdfData: quote ? quotePdfData(quote) : undefined,
      invoicePdfData: invoice ? invoicePdfData(invoice) : undefined,
    };
  });
  if (!reserved.isNew) return reserved.message;
  const message = reserved.message;
  let providerMessageId: string | null = null;
  let failure: ReturnType<typeof classifySmtpError> | null = null;
  let smtpAttempted = false;
  // Keine DB-Transaktion während SMTP; keine automatischen Retries.
  try {
    const quoteAttachment = reserved.invoicePdfData
      ? {
          filename: `${reserved.invoicePdfData.invoiceNumber}.pdf`,
          content: await (
            await import("@/modules/invoices/pdf")
          ).generateInvoicePdf(reserved.invoicePdfData),
        }
      : reserved.pdfData
        ? {
            filename: `${reserved.pdfData.quoteNumber}.pdf`,
            content: await (
              await import("@/modules/quotes/pdf")
            ).generateQuotePdf(reserved.pdfData),
          }
        : undefined;
    smtpAttempted = true;
    providerMessageId = await sendSmtpMail({ ...message, quoteAttachment });
  } catch (error) {
    failure = classifySmtpError(error);
  }
  // An ambiguous result may already have delivered any kind of message.
  // Keep the reservation until the operator reconciles the provider outcome.
  if (smtpAttempted && failure && failure.deliveryUncertain) {
    try {
      return await prisma.emailMessage.update({
        where: { id: message.id },
        data: {
          errorCode: failure.code,
          errorMessage:
            "Der Versandausgang ist unklar. Bitte nicht erneut senden; den Owner kontaktieren.",
        },
      });
    } catch {
      return message;
    }
  }
  const status = failure ? "FAILED" : "SENT";
  try {
    return await prisma.$transaction(async (tx) => {
      if (message.quoteId) {
        await lockQuote(tx, message.quoteId);
        if (!failure) {
          const changed = await tx.quote.updateMany({
            where: {
              id: message.quoteId,
              version: message.quoteVersion || 0,
              status: "READY",
              deletedAt: null,
            },
            data: { status: "SENT", sentAt: new Date(), version: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new AppError("Angebotsversand konnte nicht abgeschlossen werden.");
          await recordQuote(
            tx,
            await tx.quote.findUniqueOrThrow({ where: { id: message.quoteId } }),
            userId,
            "QUOTE_SENT",
            "QUOTE_STATUS_CHANGED",
          );
        }
      }
      if (message.invoiceId) {
        await lockInvoice(tx, message.invoiceId);
        if (!failure) {
          const changed = await tx.invoice.updateMany({
            where: {
              id: message.invoiceId,
              version: message.invoiceVersion || 0,
              status: "READY",
              deletedAt: null,
            },
            data: { status: "SENT", sentAt: new Date(), version: { increment: 1 } },
          });
          if (changed.count !== 1)
            throw new AppError("Rechnungsversand konnte nicht abgeschlossen werden.");
          await recordInvoice(
            tx,
            await tx.invoice.findUniqueOrThrow({ where: { id: message.invoiceId } }),
            userId,
            "INVOICE_SENT",
            "INVOICE_STATUS_CHANGED",
          );
        }
      }
      const updated = await tx.emailMessage.update({
        where: { id: message.id },
        data: {
          status,
          providerMessageId,
          sentAt: failure ? null : new Date(),
          failedAt: failure ? new Date() : null,
          errorCode: failure?.code || null,
          errorMessage: failure?.message || null,
        },
      });
      const context = {
        companyId: message.companyId || undefined,
        contactId: message.contactId || undefined,
        leadId: message.leadId || undefined,
        dealId: message.dealId || undefined,
      };
      await logActivity(tx, {
        ...context,
        type: failure ? "EMAIL_FAILED" : "EMAIL_SENT",
        userId,
        metadata: {
          emailMessageId: message.id,
          toEmail: message.toEmail,
          subject: message.subject,
          status,
        },
      });
      await writeCrmAuditLog(tx, {
        action: failure ? "EMAIL_FAILED" : "EMAIL_SENT",
        userId,
        entityType: "EmailMessage",
        entityId: message.id,
        metadata: { ...context, emailMessageId: message.id, status },
      });
      return updated;
    });
  } catch {
    // Niemals erneut senden: SMTP könnte bereits zugestellt haben. SENDING ist
    // absichtlich der persistierte Zustand, bis manuell serverseitig geklärt.
    console.error(
      JSON.stringify({
        event: "EMAIL_FINALIZATION_FAILED",
        emailMessageId: message.id,
        smtpOutcome: status,
      }),
    );
    return message;
  }
}
