"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import type { EmailContext } from "@/validations/email";
import { sendEmailAction, type EmailActionState } from "../actions";
import { Button } from "@/components/ui/button";

type ContactOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};
type Template = { id: string; name: string; subject: string; body: string };
const inputClass =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)]";
export function ComposeForm({
  context,
  idempotencyKey,
  recipient = "",
  recipientName = "",
  contacts = [],
  templates,
  configured,
  quote,
  invoice,
}: {
  context: EmailContext;
  idempotencyKey: string;
  recipient?: string;
  recipientName?: string;
  contacts?: ContactOption[];
  templates: Template[];
  configured: boolean;
  invoice?: { id: string; version: number; number: string; subject: string; textBody: string };
  quote?: { id: string; version: number; number: string; subject: string; textBody: string };
}) {
  const [state, action, pending] = useActionState<EmailActionState, FormData>(sendEmailAction, {
    error: null,
  });
  const [toEmail, setToEmail] = useState(recipient);
  const [toName, setToName] = useState(recipientName);
  const [contactId, setContactId] = useState(context.contactId || "");
  const [subject, setSubject] = useState(invoice?.subject || quote?.subject || "");
  const [body, setBody] = useState(invoice?.textBody || quote?.textBody || "");
  const finished = !!state.emailId;
  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4 text-black">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {invoice && (
        <>
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="invoiceVersion" value={invoice.version} />
          <p className="rounded-md bg-black/5 p-3 text-sm">
            Anhang: {invoice.number}.pdf · Die gespeicherte Rechnung wird nach erfolgreichem Versand
            als gesendet markiert.{" "}
            <Link className="underline" href={`/invoices/${invoice.id}/pdf`} target="_blank">
              PDF prüfen
            </Link>
          </p>
        </>
      )}
      {quote && (
        <>
          <input type="hidden" name="quoteId" value={quote.id} />
          <input type="hidden" name="quoteVersion" value={quote.version} />
          <p className="rounded-md bg-black/5 p-3 text-sm">
            Anhang: {quote.number}.pdf · Das gespeicherte Angebot wird nach erfolgreichem Versand
            als gesendet markiert.{" "}
            <Link className="underline" href={`/quotes/${quote.id}/pdf`} target="_blank">
              PDF prüfen
            </Link>
          </p>
        </>
      )}
      <input type="hidden" name="toName" value={toName} />
      <input type="hidden" name="contactId" value={contactId} />
      {(["companyId", "leadId", "dealId"] as const).map((key) => (
        <input key={key} type="hidden" name={key} value={context[key] || ""} />
      ))}
      {!configured && (
        <p role="alert" className="text-sm text-red-700">
          SMTP ist nicht konfiguriert. Versand ist noch nicht möglich; bitte den Owner kontaktieren.
        </p>
      )}
      {contacts.length > 0 && (
        <label className="text-sm">
          Kontakt auswählen (optional)
          <select
            className={inputClass}
            value={contactId}
            disabled={pending || finished}
            onChange={(event) => {
              const selected = contacts.find((c) => c.id === event.target.value);
              setContactId(selected?.id || "");
              setToEmail(selected?.email || "");
              setToName(
                selected ? [selected.firstName, selected.lastName].filter(Boolean).join(" ") : "",
              );
            }}
          >
            <option value="">Keinen Kontakt auswählen</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.firstName, c.lastName].filter(Boolean).join(" ")} — {c.email || "keine E-Mail"}
              </option>
            ))}
          </select>
        </label>
      )}
      {templates.length > 0 && (
        <label className="text-sm">
          Vorlage
          <select
            className={inputClass}
            defaultValue=""
            disabled={pending || finished}
            onChange={(event) => {
              const t = templates.find((t) => t.id === event.target.value);
              if (t) {
                setSubject(t.subject);
                setBody(t.body);
              }
            }}
          >
            <option value="">Keine Vorlage</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-sm">
        An
        <input
          className={inputClass}
          name="toEmail"
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          required
          maxLength={200}
          readOnly={pending || finished}
        />
      </label>
      <label className="text-sm">
        Betreff
        <input
          className={inputClass}
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={200}
          readOnly={pending || finished}
        />
      </label>
      <label className="text-sm">
        Nachricht
        <textarea
          className={`${inputClass} min-h-56`}
          name="textBody"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={50_000}
          readOnly={pending || finished}
        />
      </label>
      <p className="text-xs text-muted">
        Die Nachricht wird erst nach Klick auf „E-Mail senden“ versendet.
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {finished ? (
        <div className="text-sm">
          <p>
            {state.status === "SENT"
              ? "E-Mail gesendet."
              : "Die Versandanfrage wurde gespeichert. Bitte den Status prüfen."}
          </p>
          <Link className="underline" href={`/emails/${state.emailId}`}>
            E-Mail öffnen
          </Link>
        </div>
      ) : (
        <Button type="submit" disabled={pending || !configured}>
          {pending ? "Wird gesendet…" : "E-Mail senden"}
        </Button>
      )}
    </form>
  );
}
