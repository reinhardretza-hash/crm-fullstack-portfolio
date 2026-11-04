export const EMAIL_ERRORS = {
  SMTP_NOT_CONFIGURED: "SMTP ist nicht konfiguriert. Bitte den Owner kontaktieren.",
  SMTP_AUTH_FAILED: "SMTP-Anmeldung fehlgeschlagen. Bitte den Owner kontaktieren.",
  SMTP_CONNECTION_FAILED: "Verbindung zum Mailserver nicht möglich.",
  RECIPIENT_REJECTED: "Der Mailserver hat den Empfänger abgelehnt.",
  TIMEOUT: "Zeitüberschreitung beim Mailserver. Der Versand konnte nicht bestätigt werden.",
  UNKNOWN: "Die E-Mail konnte nicht versendet werden.",
} as const;
export type EmailErrorCode = keyof typeof EMAIL_ERRORS;
export class EmailError extends Error {
  constructor(
    public code: EmailErrorCode,
    public deliveryUncertain = ["TIMEOUT", "UNKNOWN", "SMTP_CONNECTION_FAILED"].includes(code),
  ) {
    super(EMAIL_ERRORS[code]);
  }
}
export function classifySmtpError(error: unknown): EmailError {
  if (error instanceof EmailError) return error;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "EAUTH") return new EmailError("SMTP_AUTH_FAILED");
  if (code === "EENVELOPE") return new EmailError("RECIPIENT_REJECTED");
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") return new EmailError("TIMEOUT");
  if (["ECONNREFUSED", "ENOTFOUND", "EDNS", "ETLS"].includes(code))
    return new EmailError("SMTP_CONNECTION_FAILED", false);
  if (["ECONNECTION", "ESOCKET"].includes(code))
    return new EmailError("SMTP_CONNECTION_FAILED", true);
  return new EmailError("UNKNOWN");
}
