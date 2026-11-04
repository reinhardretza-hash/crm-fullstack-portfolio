import { InvoiceContextSection } from "@/modules/invoices/components/context-section";
import Link from "next/link";
import { DocumentSendLink } from "@/modules/email/components/document-send-link";
import { notFound } from "next/navigation";
import { getQuote } from "@/modules/quotes/queries";
import { effectiveQuoteStatus, canEditQuote, QUOTE_STATUS_LABELS } from "@/modules/quotes/helpers";
import { QuoteActions } from "@/modules/quotes/components/quote-actions";
import { formatCentsAsEuro, scaledIntegerToDecimal } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "@/modules/activity/components/timeline";
export const metadata = { title: "Angebot – RDEvolution CRM" };
const date = (value: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "short" }).format(value);
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const quote = await getQuote((await params).id);
  if (!quote) notFound();
  const status = effectiveQuoteStatus(quote),
    name = [quote.contact?.firstName, quote.contact?.lastName].filter(Boolean).join(" ");
  const cls = "rounded-md border border-black/15 px-3 py-2 text-sm";
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{quote.quoteNumber}</h2>
          <p className="mt-1 text-sm text-secondary">
            {QUOTE_STATUS_LABELS[status]} · Version {quote.version}
          </p>
        </div>
        <Link className="text-sm underline" href="/quotes">
          Alle Angebote
        </Link>
      </div>
      <div className="flex flex-wrap gap-3">
        {canEditQuote(status) && (
          <Link className={cls} href={`/quotes/${quote.id}/edit`}>
            Bearbeiten
          </Link>
        )}
        <Link className={cls} href={`/quotes/${quote.id}/pdf`} target="_blank">
          PDF öffnen
        </Link>
        <a className={cls} href={`/quotes/${quote.id}/pdf?download=1`}>
          PDF herunterladen
        </a>
        <DocumentSendLink kind="Angebot" document={quote} ready={status === "READY"} />
      </div>
      {status === "ACCEPTED" && (
        <Link className={cls} href={`/invoices/new?quoteId=${quote.id}`}>
          Rechnung erstellen
        </Link>
      )}
      <InvoiceContextSection
        context={{ quoteId: quote.id }}
        assignedUserId={quote.assignedUserId}
      />
      <QuoteActions
        id={quote.id}
        version={quote.version}
        status={status}
        number={quote.quoteNumber}
      />
      <Card>
        <CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-2">
          <p>Angebotsdatum: {date(quote.issueDate)}</p>
          <p>Gültig bis: {date(quote.validUntil)}</p>
          <p>
            Unternehmen:{" "}
            <Link className="underline" href={`/companies/${quote.companyId}`}>
              {quote.company.name}
            </Link>
          </p>
          <p>
            Kontakt:{" "}
            {quote.contact ? (
              <Link className="underline" href={`/contacts/${quote.contactId}`}>
                {name || "Kontakt"}
              </Link>
            ) : (
              "–"
            )}
          </p>
          <p>
            Deal:{" "}
            {quote.deal ? (
              <Link className="underline" href={`/deals/${quote.dealId}`}>
                {quote.deal.name}
              </Link>
            ) : (
              "–"
            )}
          </p>
          <p>
            Verantwortlicher: {quote.assignedUser.firstName} {quote.assignedUser.lastName}
          </p>
          <p>
            PDF-Empfänger: {quote.recipientName} {quote.recipientContact}
          </p>
          <p>Währung: {quote.currency}</p>
          {quote.sentAt && <p>Gesendet: {date(quote.sentAt)}</p>}
          {quote.acceptedAt && <p>Angenommen: {date(quote.acceptedAt)}</p>}
          {quote.rejectedAt && <p>Abgelehnt: {date(quote.rejectedAt)}</p>}
        </CardContent>
      </Card>
      {quote.introText && (
        <p className="whitespace-pre-wrap break-words text-sm">{quote.introText}</p>
      )}
      <section aria-label="Positionen" className="flex min-w-0 flex-col gap-3">
        {quote.items.map((item) => (
          <Card key={item.id}>
            <CardContent className="pt-5 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="break-words font-semibold">
                  {item.position}. {item.title}
                </h3>
                <span>{formatCentsAsEuro(item.lineTotalCents)} brutto</span>
              </div>
              {item.description && (
                <p className="mt-2 whitespace-pre-wrap break-words text-secondary">
                  {item.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-secondary">
                <span>
                  {scaledIntegerToDecimal(item.quantity, 3)
                    .replace(/\.?0+$/, "")
                    .replace(".", ",")}{" "}
                  {item.unit}
                </span>
                <span>Einzelpreis: {formatCentsAsEuro(item.unitPriceCents)}</span>
                <span>Netto: {formatCentsAsEuro(item.lineSubtotalCents)}</span>
                <span>
                  Steuer {(item.taxRateBasisPoints ?? quote.taxRateBasisPoints) / 100} %:{" "}
                  {formatCentsAsEuro(item.lineTaxCents)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="ml-auto flex w-full max-w-sm flex-col gap-2 rounded-lg bg-black/5 p-4 text-sm">
        <p className="flex justify-between">
          <span>Netto</span>
          <span>{formatCentsAsEuro(quote.subtotalCents)}</span>
        </p>
        <p className="flex justify-between">
          <span>Steuer</span>
          <span>{formatCentsAsEuro(quote.taxCents)}</span>
        </p>
        <p className="flex justify-between border-t border-black/15 pt-2 text-base font-semibold">
          <span>Brutto</span>
          <span>{formatCentsAsEuro(quote.totalCents)}</span>
        </p>
      </div>
      {quote.customerNote && (
        <p className="whitespace-pre-wrap break-words text-sm">{quote.customerNote}</p>
      )}
      {quote.closingText && (
        <p className="whitespace-pre-wrap break-words text-sm">{quote.closingText}</p>
      )}
      {quote.internalNote && (
        <Card>
          <CardHeader>
            <CardTitle>Interne Notiz · nur CRM</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap break-words text-sm">
            {quote.internalNote}
          </CardContent>
        </Card>
      )}
      {quote.emails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Angebots-E-Mails</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {quote.emails.map((email) => (
              <Link key={email.id} href={`/emails/${email.id}`} className="break-words underline">
                {email.subject} · {email.status}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Historie</CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline activities={quote.activities} />
        </CardContent>
      </Card>
    </div>
  );
}
