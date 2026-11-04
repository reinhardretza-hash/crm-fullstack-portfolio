import Link from "next/link";
import type { EmailStatus } from "@/generated/prisma/client";
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  DRAFT: "Entwurf",
  SENDING: "Versand unbestätigt",
  SENT: "Gesendet",
  FAILED: "Fehlgeschlagen",
};
type Summary = {
  id: string;
  status: EmailStatus;
  toEmail: string;
  subject: string;
  createdAt: Date;
  sentByUser: { firstName: string; lastName: string };
};
export function EmailTable({ messages }: { messages: Summary[] }) {
  if (!messages.length)
    return <p className="p-5 text-sm text-muted">Keine E-Mails vorhanden.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs text-muted">
          <tr>
            {["Datum", "Empfänger", "Betreff", "Status", "Absender"].map((label) => (
              <th className="p-3" key={label}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {messages.map((mail) => (
            <tr className="border-b last:border-0" key={mail.id}>
              <td className="p-3 whitespace-nowrap">
                {mail.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
              </td>
              <td className="p-3 break-all">{mail.toEmail}</td>
              <td className="p-3">
                <Link className="underline" href={`/emails/${mail.id}`}>
                  {mail.subject}
                </Link>
              </td>
              <td className="p-3">{EMAIL_STATUS_LABELS[mail.status]}</td>
              <td className="p-3">
                {mail.sentByUser.firstName} {mail.sentByUser.lastName}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
