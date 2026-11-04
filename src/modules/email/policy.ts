import { createHash } from "node:crypto";
import { AppError, ForbiddenError } from "@/lib/errors";
import type { EmailSendInput } from "@/validations/email";
export const EMAIL_SEND_LIMIT = 5;
export const EMAIL_SEND_WINDOW_MS = 60_000;
export function isEmailRateLimited(count: number): boolean {
  return count >= EMAIL_SEND_LIMIT;
}
export function emailRequestHash(input: EmailSendInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.toEmail,
        input.toName || null,
        input.subject,
        input.textBody,
        input.contactId || null,
        input.companyId || null,
        input.leadId || null,
        input.dealId || null,
        // Preserve Phase-7 hashes for mail without quote context.
        ...(input.quoteId ? [input.quoteId, input.quoteVersion || null] : []),
        ...(input.invoiceId ? ["invoice", input.invoiceId, input.invoiceVersion || null] : []),
      ]),
    )
    .digest("hex");
}
export function assertEmailReplay(
  existing: { sentByUserId: string; requestHash: string },
  userId: string,
  hash: string,
): void {
  if (existing.sentByUserId !== userId) throw new ForbiddenError();
  if (existing.requestHash !== hash)
    throw new AppError(
      "Diese Versandanfrage wurde bereits für eine andere Nachricht verwendet. Bitte das Formular neu öffnen.",
    );
}
