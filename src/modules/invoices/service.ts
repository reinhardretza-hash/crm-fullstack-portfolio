import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, Invoice, ActivityType } from "@/generated/prisma/client";
import { AppError, ForbiddenError } from "@/lib/errors";
import { invoiceFormSchema, invoiceMutationSchema } from "@/validations/invoice";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { calculateQuoteItem, calculateQuoteTotals } from "@/modules/quotes/calculations";
import {
  canEditInvoice,
  canDeleteInvoice,
  canTransitionInvoice,
  effectiveInvoiceStatus,
  formatInvoiceNumber,
  type InvoiceStatus,
} from "./helpers";
import { resolveInvoiceContext } from "./context";
import { issuerSnapshot } from "./issuer";
import { logActivity } from "@/modules/activity/log";
import { writeCrmAuditLog, type CrmAuditAction } from "@/modules/audit/log";
export const INVOICE_CONFLICT_MESSAGE =
  "Die Rechnung wurde zwischenzeitlich geändert. Bitte die Seite neu laden.";
async function actor(tx: Prisma.TransactionClient, userId: string) {
  if (!(await tx.user.findFirst({ where: { id: userId, isActive: true } })))
    throw new ForbiddenError();
}
// Same lock in mutations and email reservation/finalization. SMTP never holds it.
export async function lockInvoice(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 900002))`;
}
export async function assertInvoiceAvailable(
  tx: Prisma.TransactionClient,
  id: string,
  expectedVersion: number,
) {
  await lockInvoice(tx, id);
  const invoice = await tx.invoice.findFirst({
    where: { id, deletedAt: null },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!invoice) throw new AppError("Rechnung wurde nicht gefunden.");
  if (invoice.version !== expectedVersion) throw new AppError(INVOICE_CONFLICT_MESSAGE);
  if (await tx.emailMessage.count({ where: { invoiceId: id, status: "SENDING" } }))
    throw new AppError(
      "Ein Rechnungsversand läuft oder muss noch geklärt werden. Bitte den Versandstatus prüfen.",
    );
  return invoice;
}
export async function recordInvoice(
  tx: Prisma.TransactionClient,
  invoice: Invoice,
  userId: string,
  type: ActivityType,
  action: CrmAuditAction,
) {
  const context = {
    companyId: invoice.companyId,
    contactId: invoice.contactId || undefined,
    dealId: invoice.dealId || undefined,
    invoiceId: invoice.id,
    quoteId: invoice.quoteId || undefined,
  };
  await logActivity(tx, {
    ...context,
    userId,
    type,
    metadata: { invoiceNumber: invoice.invoiceNumber, status: invoice.status },
  });
  await writeCrmAuditLog(tx, {
    ...context,
    userId,
    action,
    entityType: "Invoice",
    entityId: invoice.id,
    metadata: { ...context, status: invoice.status, version: invoice.version },
  });
}
export async function saveInvoice(
  userId: string,
  raw: unknown,
  mutation?: { id: string; expectedVersion: number },
) {
  const parsed = invoiceFormSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(parsed.error.issues[0]?.message || "Bitte Eingaben prüfen.");
  const data = parsed.data;
  if (mutation) invoiceMutationSchema.parse(mutation);
  return prisma.$transaction(
    async (tx) => {
      await actor(tx, userId);
      const before = mutation
        ? await assertInvoiceAvailable(tx, mutation.id, mutation.expectedVersion)
        : null;
      if (before && !canEditInvoice(effectiveInvoiceStatus(before)))
        throw new AppError("Diese Rechnung ist inhaltlich schreibgeschützt.");
      if (!(await tx.user.findFirst({ where: { id: data.assignedUserId, isActive: true } })))
        throw new AppError("Bitte einen aktiven Verantwortlichen auswählen.");
      const { context, company, contact, quote } = await resolveInvoiceContext(tx, data);
      if (before && before.quoteId !== (data.quoteId || null))
        throw new AppError("Die Angebotsverknüpfung kann nicht geändert werden.");
      if (!before && quote) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${quote.id}, 900003))`;
        if (
          !data.confirmDuplicate &&
          (await tx.invoice.count({
            where: { quoteId: quote.id, deletedAt: null, status: { not: "CANCELLED" } },
          }))
        )
          throw new AppError(
            "Zu diesem Angebot existiert bereits eine aktive Rechnung. Bitte die weitere Vollrechnung ausdrücklich bestätigen.",
          );
      }
      const settings = await tx.systemSettings.findUniqueOrThrow({ where: { singleton: true } });
      if (settings.currency !== "EUR") throw new AppError("Rechnungen unterstützen derzeit EUR.");
      const existingIds = new Set(before?.items.map((i) => i.id));
      const suppliedIds = data.items.flatMap((i) => (i.id ? [i.id] : []));
      if (
        new Set(suppliedIds).size !== suppliedIds.length ||
        suppliedIds.some((id) => !existingIds.has(id))
      )
        throw new AppError("Ungültige Rechnungspositionen.");
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
        taxRateBasisPoints: item.taxRateBasisPoints ?? data.taxRateBasisPoints,
        ...calculateQuoteItem({
          quantity: item.quantity,
          unitPriceCents: item.unitPrice,
          taxRateBasisPoints: item.taxRateBasisPoints ?? data.taxRateBasisPoints,
        }),
      }));
      const totals = calculateQuoteTotals(items);
      const payload = {
        quoteId: quote?.id || null,
        issuerSnapshot: issuerSnapshot(settings),
        companyId: context.companyId,
        contactId: context.contactId || null,
        dealId: context.dealId || null,
        assignedUserId: data.assignedUserId,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
        taxRateBasisPoints: data.taxRateBasisPoints,
        ...totals,
        issuerName: settings.legalCompanyName || settings.companyName,
        recipientName: quote?.recipientName ?? company.name,
        recipientAddress:
          quote?.recipientAddress ??
          [
            company.street,
            [company.postalCode, company.city].filter(Boolean).join(" "),
            company.country,
          ]
            .filter(Boolean)
            .join("\n"),
        recipientContact: quote
          ? quote.recipientContact
          : contact
            ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
            : null,
        introText: data.introText,
        closingText: data.closingText,
        internalNote: data.internalNote,
        customerNote: data.customerNote,
      };
      let invoice: Invoice;
      if (mutation) {
        const result = await tx.invoice.updateMany({
          where: { id: mutation.id, version: mutation.expectedVersion, deletedAt: null },
          data: { ...payload, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new AppError(INVOICE_CONFLICT_MESSAGE);
        // Delete/reinsert atomically preserves IDs and avoids transient unique-position collisions.
        await tx.invoiceItem.deleteMany({ where: { invoiceId: mutation.id } });
        await tx.invoiceItem.createMany({
          data: items.map((i) => ({ ...i, invoiceId: mutation.id })),
        });
        invoice = await tx.invoice.findUniqueOrThrow({ where: { id: mutation.id } });
      } else {
        const year = Number(dateKeyInTimeZone(new Date()).slice(0, 4));
        const [sequence] = await tx.$queryRaw<
          { last_number: number }[]
        >`INSERT INTO invoice_number_sequences (year,last_number) VALUES (${year},1) ON CONFLICT (year) DO UPDATE SET last_number=invoice_number_sequences.last_number+1 RETURNING last_number`;
        invoice = await tx.invoice.create({
          data: {
            ...payload,
            currency: settings.currency,
            invoiceNumber: formatInvoiceNumber(year, sequence.last_number),
            createdById: userId,
            items: { create: items },
          },
        });
      }
      await recordInvoice(
        tx,
        invoice,
        userId,
        mutation ? "INVOICE_UPDATED" : "INVOICE_CREATED",
        mutation ? "INVOICE_UPDATED" : "INVOICE_CREATED",
      );
      return invoice;
    },
    { timeout: 20000 },
  );
}
const STATUS_ACTIVITY: Record<InvoiceStatus, ActivityType> = {
  DRAFT: "INVOICE_REOPENED",
  READY: "INVOICE_READY",
  SENT: "INVOICE_SENT",
  PAID: "INVOICE_PAID",
  OVERDUE: "INVOICE_SENT",
  CANCELLED: "INVOICE_CANCELLED",
};
export async function changeInvoice(
  userId: string,
  mutation: { id: string; expectedVersion: number },
  status: InvoiceStatus | "DELETE",
) {
  invoiceMutationSchema.parse(mutation);
  return prisma.$transaction(async (tx) => {
    await actor(tx, userId);
    const before = await assertInvoiceAvailable(tx, mutation.id, mutation.expectedVersion);
    const current = effectiveInvoiceStatus(before);
    if (status === "DELETE" && !canDeleteInvoice(current))
      throw new AppError("Nur Rechnungen im Status Entwurf oder Bereit können gelöscht werden.");
    if (status !== "DELETE" && !canTransitionInvoice(current, status))
      throw new AppError("Diese Aktion ist in diesem Rechnungsstatus nicht möglich.");
    if (status === "READY" && !before.items.length)
      throw new AppError("Mindestens eine Position ist erforderlich.");

    const result = await tx.invoice.updateMany({
      where: { id: mutation.id, version: mutation.expectedVersion, deletedAt: null },
      data: {
        ...(status === "DELETE" ? { deletedAt: new Date() } : { status }),
        version: { increment: 1 },
        ...(status === "SENT"
          ? { sentAt: new Date() }
          : status === "PAID"
            ? { paidAt: new Date() }
            : status === "CANCELLED"
              ? { cancelledAt: new Date() }
              : {}),
      },
    });
    if (result.count !== 1) throw new AppError(INVOICE_CONFLICT_MESSAGE);
    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: mutation.id } });
    await recordInvoice(
      tx,
      invoice,
      userId,
      status === "DELETE" ? "INVOICE_DELETED" : STATUS_ACTIVITY[status],
      status === "DELETE" ? "INVOICE_DELETED" : "INVOICE_STATUS_CHANGED",
    );
    return invoice;
  });
}
