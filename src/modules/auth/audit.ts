import { prisma } from "@/lib/prisma";

export type AuthAuditAction = "LOGIN_SUCCESS" | "LOGIN_FAILED" | "LOGOUT";

type WriteAuthAuditLogInput = {
  action: AuthAuditAction;
  userId?: string;
  // Nur der gehashte Identifier, niemals die Klartext-E-Mail - auch nicht bei
  // unbekannten Accounts. Kein IP/User-Agent, da dafür kein fachlicher Bedarf
  // besteht und es unnötige personenbezogene Daten wären.
  identifierHash?: string;
};

// Schmaler, absichtlich eingeschränkter Wrapper um AuditLog.create für
// Auth-Ereignisse: verhindert, dass versehentlich Passwörter, Secrets oder
// Klartext-E-Mails in die Metadaten geraten, da der Aufrufer nur die hier
// gelisteten Felder übergeben kann.
export async function writeAuthAuditLog({
  action,
  userId,
  identifierHash,
}: WriteAuthAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorType: userId ? "USER" : "SYSTEM",
      userId,
      action,
      entityType: "User",
      entityId: userId,
      metadata: identifierHash ? { identifierHash } : undefined,
    },
  });
}
