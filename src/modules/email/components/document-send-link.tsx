import Link from "next/link";
import { documentRecipientError } from "@/modules/email/document-recipient";

export function DocumentSendLink({
  kind,
  document,
  ready,
}: {
  kind: "Angebot" | "Rechnung";
  document: Parameters<typeof documentRecipientError>[1] & { id: string; contactId: string | null };
  ready: boolean;
}) {
  const error = documentRecipientError(kind, document);
  if (error)
    return (
      <p className="basis-full text-sm text-black/70">
        {error}{" "}
        {document.contact && !document.contact.deletedAt && !document.company.deletedAt && (
          <Link className="underline" href={`/contacts/${document.contactId}/edit`}>
            Kontakt bearbeiten
          </Link>
        )}
      </p>
    );
  if (!ready) return null;
  return (
    <Link
      className="rounded-md bg-[var(--gold)] px-3 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
      href={`/emails/new?${kind === "Angebot" ? "quoteId" : "invoiceId"}=${document.id}`}
    >
      Per E-Mail senden
    </Link>
  );
}
