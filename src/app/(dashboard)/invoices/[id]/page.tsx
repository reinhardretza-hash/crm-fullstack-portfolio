import { issuerSchema, issuerIncomplete } from "@/modules/invoices/issuer";
import Link from "next/link";
import { DocumentSendLink } from "@/modules/email/components/document-send-link";
import { notFound } from "next/navigation";
import { getInvoice } from "@/modules/invoices/queries";
import {
  effectiveInvoiceStatus,
  canEditInvoice,
  INVOICE_STATUS_LABELS,
} from "@/modules/invoices/helpers";
import { InvoiceActions } from "@/modules/invoices/components/invoice-actions";
import { formatCentsAsEuro, scaledIntegerToDecimal } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "@/modules/activity/components/timeline";
export const metadata = { title: "Rechnung – RDEvolution CRM" };
const date = (value: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "short" }).format(value);
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const invoice = await getInvoice((await params).id);
  if (!invoice) notFound();
  const status = effectiveInvoiceStatus(invoice),
    name = [invoice.contact?.firstName, invoice.contact?.lastName].filter(Boolean).join(" ");
  const cls = "rounded-md border border-black/15 px-3 py-2 text-sm";
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{invoice.invoiceNumber}</h2>
          <p className="mt-1 text-sm text-secondary">
            {INVOICE_STATUS_LABELS[status]} · Version {invoice.version}
          </p>
        </div>
        <Link className="text-sm underline" href="/invoices">
          Alle Rechnungen
        </Link>
      </div>
      <div className="flex flex-wrap gap-3">
        {canEditInvoice(status) && (
          <Link className={cls} href={`/invoices/${invoice.id}/edit`}>
            Bearbeiten
          </Link>
        )}
        <Link className={cls} href={`/invoices/${invoice.id}/pdf`} target="_blank">
          PDF öffnen
        </Link>
        <a className={cls} href={`/invoices/${invoice.id}/pdf?download=1`}>
          PDF herunterladen
        </a>
        <DocumentSendLink kind="Rechnung" document={invoice} ready={status === "READY"} />
      </div>
      {invoice.quote && (
        <Link className="text-sm underline" href={`/quotes/${invoice.quote.id}`}>
          Angebot {invoice.quote.quoteNumber}
        </Link>
      )}
      {issuerIncomplete(issuerSchema.parse(invoice.issuerSnapshot)) && (
        <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm">
          Entwicklungsstand: Ausstellerdaten unvollständig. Keine Rechtskonformität bestätigt. Bitte
          Einstellungen vor einer neuen Rechnung vervollständigen.
        </p>
      )}
      <InvoiceActions
        id={invoice.id}
        version={invoice.version}
        status={status}
        number={invoice.invoiceNumber}
      />
      <Card>
        <CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-2">
          <p>Rechnungsdatum: {date(invoice.issueDate)}</p>
          <p>Fällig am: {date(invoice.dueDate)}</p>
          <p>
            Unternehmen:{" "}
            <Link className="underline" href={`/companies/${invoice.companyId}`}>
              {invoice.company.name}
            </Link>
          </p>
          <p>
            Kontakt:{" "}
            {invoice.contact ? (
              <Link className="underline" href={`/contacts/${invoice.contactId}`}>
                {name || "Kontakt"}
              </Link>
            ) : (
              "–"
            )}
          </p>
          <p>
            Deal:{" "}
            {invoice.deal ? (
              <Link className="underline" href={`/deals/${invoice.dealId}`}>
                {invoice.deal.name}
              </Link>
            ) : (
              "–"
            )}
          </p>
          <p>
            Verantwortlicher: {invoice.assignedUser.firstName} {invoice.assignedUser.lastName}
          </p>
          <p>
            PDF-Empfänger: {invoice.recipientName} {invoice.recipientContact}
          </p>
          <p>Währung: {invoice.currency}</p>
          {invoice.sentAt && <p>Gesendet: {date(invoice.sentAt)}</p>}
          {invoice.paidAt && <p>Bezahlt: {date(invoice.paidAt)}</p>}
          {invoice.cancelledAt && <p>Intern storniert: {date(invoice.cancelledAt)}</p>}
        </CardContent>
      </Card>
      {invoice.introText && (
        <p className="whitespace-pre-wrap break-words text-sm">{invoice.introText}</p>
      )}
      <section aria-label="Positionen" className="flex min-w-0 flex-col gap-3">
        {invoice.items.map((item) => (
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
                  Steuer {(item.taxRateBasisPoints ?? invoice.taxRateBasisPoints) / 100} %:{" "}
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
          <span>{formatCentsAsEuro(invoice.subtotalCents)}</span>
        </p>
        <p className="flex justify-between">
          <span>Steuer</span>
          <span>{formatCentsAsEuro(invoice.taxCents)}</span>
        </p>
        <p className="flex justify-between border-t border-black/15 pt-2 text-base font-semibold">
          <span>Brutto</span>
          <span>{formatCentsAsEuro(invoice.totalCents)}</span>
        </p>
      </div>
      {invoice.customerNote && (
        <p className="whitespace-pre-wrap break-words text-sm">{invoice.customerNote}</p>
      )}
      {invoice.closingText && (
        <p className="whitespace-pre-wrap break-words text-sm">{invoice.closingText}</p>
      )}
      {invoice.internalNote && (
        <Card>
          <CardHeader>
            <CardTitle>Interne Notiz · nur CRM</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap break-words text-sm">
            {invoice.internalNote}
          </CardContent>
        </Card>
      )}
      {invoice.emails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rechnungs-E-Mails</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {invoice.emails.map((email) => (
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
          <Timeline activities={invoice.activities} />
        </CardContent>
      </Card>
    </div>
  );
}
