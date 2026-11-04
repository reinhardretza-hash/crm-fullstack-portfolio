import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { emailContextSchema } from "@/validations/email";
import { resolveEmailContext } from "@/modules/email/context";
import { listEmailTemplates } from "@/modules/email/queries";
import { ComposeForm } from "@/modules/email/components/compose-form";
import { isSmtpConfigured } from "@/modules/email/smtp";
import { AppError } from "@/lib/errors";
import { getInvoice } from "@/modules/invoices/queries";
import { invoiceEmailPrefill } from "@/modules/invoices/helpers";
import { getQuote } from "@/modules/quotes/queries";
import { effectiveQuoteStatus, quoteEmailPrefill } from "@/modules/quotes/helpers";
import { documentRecipientError } from "@/modules/email/document-recipient";
export const runtime = "nodejs";
export const metadata = { title: "E-Mail schreiben – RDEvolution CRM" };
export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  requirePagePermission(user, "EMAIL_SEND");
  const raw = await searchParams;
  if (raw.quoteId && raw.invoiceId)
    return <p role="alert">Nur ein Dokument pro Versand erlaubt.</p>;
  const invoice = typeof raw.invoiceId === "string" ? await getInvoice(raw.invoiceId) : null;
  if (raw.invoiceId && (!invoice || invoice.status !== "READY"))
    return <p role="alert">Nur bereite Rechnungen können vorbereitet werden.</p>;
  const quote = typeof raw.quoteId === "string" ? await getQuote(raw.quoteId) : null;
  if (raw.quoteId && (!quote || effectiveQuoteStatus(quote) !== "READY"))
    return <p role="alert">Nur gültige, bereite Angebote können zum Versand vorbereitet werden.</p>;
  const document = invoice || quote;
  if (document) {
    const recipientError = documentRecipientError(invoice ? "Rechnung" : "Angebot", document);
    if (recipientError) return <p role="alert">{recipientError}</p>;
  }
  const parsed = emailContextSchema.safeParse(
    document
      ? {
          companyId: document.companyId,
          contactId: document.contactId || undefined,
          dealId: document.dealId || undefined,
        }
      : raw,
  );
  if (!parsed.success) return <p role="alert">Ungültiger CRM-Kontext.</p>;
  let resolved: Awaited<ReturnType<typeof resolveEmailContext>> | undefined;
  let contextError: string | undefined;
  try {
    resolved = await resolveEmailContext(prisma, parsed.data);
  } catch (error) {
    if (error instanceof AppError) contextError = error.userMessage;
    else throw error;
  }
  if (!resolved)
    return <p role="alert">{contextError || "CRM-Kontext konnte nicht geladen werden."}</p>;
  const contacts =
    resolved.company && !resolved.contact
      ? await prisma.contact.findMany({
          where: { companyId: resolved.company.id, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: { lastName: "asc" },
        })
      : [];
  const templates = await listEmailTemplates();
  return (
    <div className="flex flex-col gap-5 text-black">
      <h2 className="text-lg font-semibold">E-Mail schreiben</h2>
      <p className="text-sm text-muted">
        {[resolved.company?.name, resolved.lead?.title, resolved.deal?.name]
          .filter(Boolean)
          .join(" · ") || "Individuelle E-Mail"}
      </p>
      {resolved.contact && !resolved.contact.email && (
        <p role="alert">
          Der Kontakt besitzt keine E-Mail-Adresse. Bitte eine Adresse hinterlegen oder einen
          Empfänger eingeben.
        </p>
      )}
      <ComposeForm
        context={resolved.context}
        recipient={resolved.contact?.email || ""}
        recipientName={[resolved.contact?.firstName, resolved.contact?.lastName]
          .filter(Boolean)
          .join(" ")}
        contacts={contacts}
        templates={templates}
        idempotencyKey={randomUUID()}
        configured={isSmtpConfigured()}
        invoice={
          invoice
            ? {
                id: invoice.id,
                version: invoice.version,
                number: invoice.invoiceNumber,
                ...invoiceEmailPrefill(invoice),
              }
            : undefined
        }
        quote={
          quote
            ? {
                id: quote.id,
                version: quote.version,
                number: quote.quoteNumber,
                ...quoteEmailPrefill(quote),
              }
            : undefined
        }
      />
    </div>
  );
}
