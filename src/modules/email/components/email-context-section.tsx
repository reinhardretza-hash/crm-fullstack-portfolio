import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailContext } from "@/validations/email";
import { listContextEmails } from "../queries";
import { EmailTable } from "./email-table";

export async function EmailContextSection({
  context,
  canCompose = true,
}: {
  context: EmailContext;
  canCompose?: boolean;
}) {
  const messages = await listContextEmails(context);
  const params = new URLSearchParams(
    Object.entries(context).filter((entry): entry is [string, string] => !!entry[1]),
  );
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle>E-Mails</CardTitle>
        {canCompose ? (
          <Link href={`/emails/new?${params}`} className="text-sm underline">
            E-Mail schreiben
          </Link>
        ) : (
          <p className="text-xs text-muted">
            Zum Schreiben wird ein Kontakt mit E-Mail-Adresse benötigt.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <EmailTable messages={messages} />
        {messages.length === 10 && (
          <Link href="/emails" className="text-xs underline">
            Gesamte E-Mail-Historie öffnen
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
