import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmailById } from "@/modules/email/queries";
import { EMAIL_STATUS_LABELS } from "@/modules/email/components/email-table";
export const metadata = { title: "E-Mail – RDEvolution CRM" };
export default async function EmailDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mail = await getEmailById(id);
  if (!mail) notFound();
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <h2 className="break-words text-lg font-semibold">{mail.subject}</h2>
      <dl className="grid grid-cols-1 gap-3 rounded-lg border border-black/10 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Von</dt>
          <dd className="break-all">
            {mail.fromName} &lt;{mail.fromEmail}&gt;
          </dd>
        </div>
        <div>
          <dt className="text-muted">An</dt>
          <dd className="break-all">
            {mail.toName} &lt;{mail.toEmail}&gt;
          </dd>
        </div>
        <div>
          <dt className="text-muted">Status</dt>
          <dd>{EMAIL_STATUS_LABELS[mail.status]}</dd>
        </div>
        <div>
          <dt className="text-muted">Versandzeit</dt>
          <dd>{mail.sentAt?.toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) || "–"}</dd>
        </div>
        <div>
          <dt className="text-muted">Verantwortlicher Absender</dt>
          <dd>
            {mail.sentByUser.firstName} {mail.sentByUser.lastName}
          </dd>
        </div>
      </dl>
      {mail.status === "SENDING" && (
        <p role="alert">
          Der Versand ist unbestätigt. Er kann bereits erfolgt sein. Bitte nicht erneut senden; den
          Owner kontaktieren.
        </p>
      )}
      {mail.status === "FAILED" && (
        <p role="alert">{mail.errorMessage || "Versand fehlgeschlagen."}</p>
      )}
      <pre className="overflow-hidden rounded-lg border border-black/10 p-4 font-sans text-sm whitespace-pre-wrap break-words">
        {mail.textBody}
      </pre>
      <div className="flex flex-wrap gap-3 text-sm">
        {mail.invoice && (
          <Link className="underline" href={`/invoices/${mail.invoice.id}`}>
            Rechnung: {mail.invoice.invoiceNumber} · PDF-Anhang
          </Link>
        )}
        {mail.quote && (
          <Link className="underline" href={`/quotes/${mail.quote.id}`}>
            Angebot: {mail.quote.quoteNumber} · PDF-Anhang
          </Link>
        )}
        {mail.contact && (
          <Link className="underline" href={`/contacts/${mail.contact.id}`}>
            Kontakt: {mail.contact.firstName} {mail.contact.lastName}
          </Link>
        )}
        {mail.company && (
          <Link className="underline" href={`/companies/${mail.company.id}`}>
            {mail.company.name}
          </Link>
        )}
        {mail.lead && (
          <Link className="underline" href={`/leads/${mail.lead.id}`}>
            {mail.lead.title}
          </Link>
        )}
        {mail.deal && (
          <Link className="underline" href={`/deals/${mail.deal.id}`}>
            {mail.deal.name}
          </Link>
        )}
      </div>
      <Link className="text-sm underline" href="/emails">
        Zur E-Mail-Historie
      </Link>
    </div>
  );
}
