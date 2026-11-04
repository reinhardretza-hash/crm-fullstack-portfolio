import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, Quote, ActivityType } from "@/generated/prisma/client";
import { AppError, ForbiddenError } from "@/lib/errors";
import { quoteFormSchema, quoteMutationSchema } from "@/validations/quote";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { calculateQuoteItem, calculateQuoteTotals } from "./calculations";
import {
  canEditQuote,
  canDeleteQuote,
  canTransitionQuote,
  effectiveQuoteStatus,
  formatQuoteNumber,
  type QuoteStatus,
} from "./helpers";
import { resolveQuoteContext } from "./context";
import { logActivity } from "@/modules/activity/log";
import { writeCrmAuditLog, type CrmAuditAction } from "@/modules/audit/log";
export const QUOTE_CONFLICT_MESSAGE =
  "Das Angebot wurde zwischenzeitlich geändert. Bitte die Seite neu laden.";
async function actor(tx: Prisma.TransactionClient, userId: string) {
  if (!(await tx.user.findFirst({ where: { id: userId, isActive: true } })))
    throw new ForbiddenError();
}
// Same lock in mutations and email reservation/finalization. SMTP never holds it.
export async function lockQuote(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 900001))`;
}
export async function assertQuoteAvailable(
  tx: Prisma.TransactionClient,
  id: string,
  expectedVersion: number,
) {
  await lockQuote(tx, id);
  const quote = await tx.quote.findFirst({
    where: { id, deletedAt: null },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!quote) throw new AppError("Angebot wurde nicht gefunden.");
  if (quote.version !== expectedVersion) throw new AppError(QUOTE_CONFLICT_MESSAGE);
  if (await tx.emailMessage.count({ where: { quoteId: id, status: "SENDING" } }))
    throw new AppError(
      "Ein Angebotsversand läuft oder muss noch geklärt werden. Bitte den Versandstatus prüfen.",
    );
  return quote;
}
export async function recordQuote(
  tx: Prisma.TransactionClient,
  quote: Quote,
  userId: string,
  type: ActivityType,
  action: CrmAuditAction,
) {
  const context = {
    companyId: quote.companyId,
    contactId: quote.contactId || undefined,
    dealId: quote.dealId || undefined,
    quoteId: quote.id,
  };
  await logActivity(tx, {
    ...context,
    userId,
    type,
    metadata: { quoteNumber: quote.quoteNumber, status: quote.status },
  });
  await writeCrmAuditLog(tx, {
    ...context,
    userId,
    action,
    entityType: "Quote",
    entityId: quote.id,
    metadata: { ...context, status: quote.status, version: quote.version },
  });
}
export async function saveQuote(
  userId: string,
  raw: unknown,
  mutation?: { id: string; expectedVersion: number },
) {
  const parsed = quoteFormSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Bitte Eingaben prüfen.");
  const data = parsed.data;
  if (mutation) quoteMutationSchema.parse(mutation);
  return prisma.$transaction(
    async (tx) => {
      await actor(tx, userId);
      const before = mutation
        ? await assertQuoteAvailable(tx, mutation.id, mutation.expectedVersion)
        : null;
      if (before && !canEditQuote(effectiveQuoteStatus(before)))
        throw new AppError("Dieses Angebot ist inhaltlich schreibgeschützt.");
      if (!(await tx.user.findFirst({ where: { id: data.assignedUserId, isActive: true } })))
        throw new AppError("Bitte einen aktiven Verantwortlichen auswählen.");
      const { context, company, contact } = await resolveQuoteContext(tx, data);
      const settings = await tx.systemSettings.findUniqueOrThrow({ where: { singleton: true } });
      if (settings.currency !== "EUR") throw new AppError("Angebote unterstützen derzeit EUR.");
      const existingIds = new Set(before?.items.map((i) => i.id));
      const suppliedIds = data.items.flatMap((i) => (i.id ? [i.id] : []));
      if (
        new Set(suppliedIds).size !== suppliedIds.length ||
        suppliedIds.some((id) => !existingIds.has(id))
      )
        throw new AppError("Ungültige Angebotspositionen.");
      const items = data.items.map((item, index) => ({
        ...(item.id
          ? { id: item.id, createdAt: before?.items.find((i) => i.id === item.id)?.createdAt }
          : {}),
        position: index + 1,
        title: item.title,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPrice,
        taxRateBasisPoints: item.taxRateBasisPoints ?? null,
        ...calculateQuoteItem({
          quantity: item.quantity,
          unitPriceCents: item.unitPrice,
          taxRateBasisPoints: item.taxRateBasisPoints ?? data.taxRateBasisPoints,
        }),
      }));
      const totals = calculateQuoteTotals(items);
      const payload = {
        companyId: context.companyId,
        contactId: context.contactId || null,
        dealId: context.dealId || null,
        assignedUserId: data.assignedUserId,
        issueDate: new Date(data.issueDate),
        validUntil: new Date(data.validUntil),
        taxRateBasisPoints: data.taxRateBasisPoints,
        ...totals,
        issuerName: settings.companyName,
        recipientName: company.name,
        recipientAddress: [
          company.street,
          [company.postalCode, company.city].filter(Boolean).join(" "),
          company.country,
        ]
          .filter(Boolean)
          .join("\n"),
        recipientContact: contact
          ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
          : null,
        introText: data.introText,
        closingText: data.closingText,
        internalNote: data.internalNote,
        customerNote: data.customerNote,
      };
      let quote: Quote;
      if (mutation) {
        const result = await tx.quote.updateMany({
          where: { id: mutation.id, version: mutation.expectedVersion, deletedAt: null },
          data: { ...payload, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new AppError(QUOTE_CONFLICT_MESSAGE);
        // Delete/reinsert atomically preserves IDs and avoids transient unique-position collisions.
        await tx.quoteItem.deleteMany({ where: { quoteId: mutation.id } });
        await tx.quoteItem.createMany({ data: items.map((i) => ({ ...i, quoteId: mutation.id })) });
        quote = await tx.quote.findUniqueOrThrow({ where: { id: mutation.id } });
      } else {
        const year = Number(dateKeyInTimeZone(new Date()).slice(0, 4));
        const [sequence] = await tx.$queryRaw<
          { last_number: number }[]
        >`INSERT INTO quote_number_sequences (year,last_number) VALUES (${year},1) ON CONFLICT (year) DO UPDATE SET last_number=quote_number_sequences.last_number+1 RETURNING last_number`;
        quote = await tx.quote.create({
          data: {
            ...payload,
            currency: settings.currency,
            quoteNumber: formatQuoteNumber(year, sequence.last_number),
            createdById: userId,
            items: { create: items },
          },
        });
      }
      await recordQuote(
        tx,
        quote,
        userId,
        mutation ? "QUOTE_UPDATED" : "QUOTE_CREATED",
        mutation ? "QUOTE_UPDATED" : "QUOTE_CREATED",
      );
      return quote;
    },
    { timeout: 20000 },
  );
}
const STATUS_ACTIVITY: Record<QuoteStatus, ActivityType> = {
  DRAFT: "QUOTE_REOPENED",
  READY: "QUOTE_READY",
  SENT: "QUOTE_SENT",
  ACCEPTED: "QUOTE_ACCEPTED",
  REJECTED: "QUOTE_REJECTED",
  EXPIRED: "QUOTE_EXPIRED",
  CANCELLED: "QUOTE_CANCELLED",
};
export async function changeQuote(
  userId: string,
  mutation: { id: string; expectedVersion: number },
  status: QuoteStatus | "DELETE",
) {
  quoteMutationSchema.parse(mutation);
  return prisma.$transaction(async (tx) => {
    await actor(tx, userId);
    const before = await assertQuoteAvailable(tx, mutation.id, mutation.expectedVersion);
    const current = effectiveQuoteStatus(before);
    if (status === "DELETE" && !canDeleteQuote(current))
      throw new AppError(
        "Nur Angebote im Status Entwurf oder Bereit können gelöscht werden. Abgelaufene Angebote sind ausgeschlossen.",
      );
    if (status !== "DELETE" && !canTransitionQuote(current, status))
      throw new AppError("Diese Aktion ist in diesem Angebotsstatus nicht möglich.");
    if (status === "READY" && !before.items.length)
      throw new AppError("Mindestens eine Position ist erforderlich.");
    if (
      (status === "READY" || status === "SENT") &&
      before.validUntil.toISOString().slice(0, 10) < dateKeyInTimeZone(new Date())
    )
      throw new AppError("Die Gültigkeit liegt in der Vergangenheit.");
    const result = await tx.quote.updateMany({
      where: { id: mutation.id, version: mutation.expectedVersion, deletedAt: null },
      data: {
        ...(status === "DELETE" ? { deletedAt: new Date() } : { status }),
        version: { increment: 1 },
        ...(status === "SENT"
          ? { sentAt: new Date() }
          : status === "ACCEPTED"
            ? { acceptedAt: new Date() }
            : status === "REJECTED"
              ? { rejectedAt: new Date() }
              : {}),
      },
    });
    if (result.count !== 1) throw new AppError(QUOTE_CONFLICT_MESSAGE);
    const quote = await tx.quote.findUniqueOrThrow({ where: { id: mutation.id } });
    await recordQuote(
      tx,
      quote,
      userId,
      status === "DELETE" ? "QUOTE_DELETED" : STATUS_ACTIVITY[status],
      status === "DELETE" ? "QUOTE_DELETED" : "QUOTE_STATUS_CHANGED",
    );
    return quote;
  });
}
