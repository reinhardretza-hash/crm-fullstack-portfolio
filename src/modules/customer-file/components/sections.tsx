import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@/generated/prisma/client";
import { PRIORITY_LABELS } from "@/lib/crm-labels";
import { formatCentsAsEuro } from "@/lib/money";
import { cn } from "@/lib/cn";
import { activityFiltersSchema } from "@/validations/activity";
import { ActivityList } from "@/modules/activity/components/activity-list";
import { listRecentActivities } from "@/modules/activity/queries";
import { EMAIL_STATUS_LABELS } from "@/modules/email/components/email-table";
import { FileDeleteButton } from "@/modules/files/components/file-delete-button";
import { FileUploadForm } from "@/modules/files/components/file-upload-form";
import { canDeleteFile, formatFileSize } from "@/modules/files/validation";
import { listFilesForTarget } from "@/modules/files/service";
import { INVOICE_STATUS_LABELS, effectiveInvoiceStatus } from "@/modules/invoices/helpers";
import { QUOTE_STATUS_LABELS, effectiveQuoteStatus } from "@/modules/quotes/helpers";
import { NoteForm } from "@/modules/notes/components/note-form";
import { NoteList } from "@/modules/notes/components/note-list";
import { isTaskOverdue } from "@/modules/tasks/due";
import { REMINDER_TYPE_LABELS } from "@/modules/reminders/rules";
import { NEXT_STEP_LABELS, type NextStepItem } from "../next-step";
import {
  getNextStep,
  listEmailsCompact,
  listInvoicesCompact,
  listOpenTasksCompact,
  listQuotesCompact,
  listRecentNotes,
  listRemindersFor,
  listUpcomingEventsCompact,
} from "../queries";
import { scopeIdField, scopeQuery, type FileScope } from "../scope";

const DATE = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short" });
const DATE_UTC = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "short" });
const DATE_TIME = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

type ViewUser = Pick<User, "id" | "role">;

function SectionCard({
  title,
  action,
  children,
  id,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Card id={id}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const linkClass = "text-sm text-black underline hover:no-underline";
const Empty = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted">{children}</p>
);

// --- Nächster Schritt: ein klarer Block, kein Kartenraster.
export async function NextStepSection({
  scope,
  user,
  dealLeadId,
}: {
  scope: FileScope;
  user: ViewUser;
  dealLeadId?: string | null;
}) {
  const { primary, others, total } = await getNextStep(scope, user, { dealLeadId });
  const when = (item: NextStepItem) =>
    item.at ? (item.kind === "EVENT" ? DATE_TIME.format(item.at) : DATE.format(item.at)) : null;

  return (
    <Card className="border-[var(--gold)]">
      <CardHeader>
        <CardTitle>Nächster Schritt</CardTitle>
      </CardHeader>
      <CardContent>
        {!primary ? (
          <Empty>
            Aktuell ist nichts offen. Lege eine Aufgabe, einen Termin oder ein Follow-up an.
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <Badge variant={primary.kind === "TASK_OVERDUE" ? "gold" : "neutral"}>
                {NEXT_STEP_LABELS[primary.kind]}
              </Badge>
              <p className="mt-1 text-base font-medium break-words text-black">
                {primary.href ? (
                  <Link href={primary.href} className="hover:underline">
                    {primary.title}
                  </Link>
                ) : (
                  primary.title
                )}
              </p>
              {when(primary) && <p className="text-xs text-muted">{when(primary)}</p>}
            </div>
            {others.length > 0 && (
              <ul className="flex flex-col gap-1 border-t border-black/10 pt-2 text-xs text-secondary">
                {others.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="break-words">
                    {NEXT_STEP_LABELS[item.kind]}:{" "}
                    {item.href ? (
                      <Link href={item.href} className="hover:underline">
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                    {when(item) ? ` · ${when(item)}` : ""}
                  </li>
                ))}
                {total > others.length + 1 && (
                  <li className="text-muted">… und {total - others.length - 1} weitere</li>
                )}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Offene Reminder dieser Akte (Phase 14).
export async function RemindersSection({
  scope,
  user,
  dealLeadId,
}: {
  scope: FileScope;
  user: ViewUser;
  dealLeadId?: string | null;
}) {
  const { items } = await listRemindersFor(scope, user, dealLeadId);
  if (items.length === 0) return null;
  return (
    <SectionCard title="Offene Erinnerungen">
      <ul className="flex flex-col gap-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="break-words">
            <span className="text-secondary">{REMINDER_TYPE_LABELS[item.type]}: </span>
            {item.target ? (
              <Link href={item.target.href} className="font-medium text-black hover:underline">
                {item.target.label}
              </Link>
            ) : (
              "–"
            )}
            {item.status === "NO_ASSIGNEE" && (
              <span className="ml-2 text-xs text-muted">Kein Verantwortlicher zugewiesen</span>
            )}
            {item.status === "INACTIVE_ASSIGNEE" && (
              <span className="ml-2 text-xs text-muted">Kein aktiver Verantwortlicher</span>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// --- Aktivitäten (gleiche Daten und Darstellung wie /activities).
export async function ActivitiesSection({ scope }: { scope: FileScope }) {
  const filters = activityFiltersSchema.parse({ [scopeIdField(scope)]: scope.id });
  const activities = await listRecentActivities(filters, 15);
  const allHref = `/activities?${scopeIdField(scope)}=${encodeURIComponent(scope.id)}`;
  return (
    <SectionCard
      title="Aktivitäten"
      action={
        <Link href={allHref} className={linkClass}>
          Alle Aktivitäten anzeigen
        </Link>
      }
    >
      <div className="-mx-5">
        <ActivityList activities={activities} hasFilters={false} canViewEmails />
      </div>
    </SectionCard>
  );
}

// --- Notizen: letzte 5 + Formular.
export async function NotesSection({ scope }: { scope: FileScope }) {
  const { notes, total } = await listRecentNotes(scope, 5);
  const target = { [scopeIdField(scope)]: scope.id } as Record<string, string>;
  return (
    <SectionCard title="Notizen" id="notizen">
      <div className="flex flex-col gap-4">
        <NoteForm {...target} />
        <NoteList notes={notes} />
        {total > notes.length && (
          <p className="text-xs text-muted">
            Die letzten {notes.length} von {total} Notizen.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

// --- E-Mails: kompakte Karten statt breiter Tabelle.
export async function EmailsSection({
  scope,
  canCompose,
}: {
  scope: FileScope;
  canCompose: boolean;
}) {
  const messages = await listEmailsCompact(scope, 5);
  return (
    <SectionCard
      title="E-Mails"
      action={
        canCompose ? (
          <Link href={`/emails/new?${scopeQuery(scope)}`} className={linkClass}>
            E-Mail schreiben
          </Link>
        ) : undefined
      }
    >
      {messages.length === 0 ? (
        <Empty>Noch keine E-Mails vorhanden.</Empty>
      ) : (
        <ul className="flex flex-col gap-3 text-sm">
          {messages.map((mail) => (
            <li key={mail.id} className="flex flex-col gap-0.5">
              <Link
                href={`/emails/${mail.id}`}
                className="font-medium break-words text-black hover:underline"
              >
                {mail.subject}
              </Link>
              <span className="text-xs break-all text-muted">
                {DATE_TIME.format(mail.createdAt)} · {EMAIL_STATUS_LABELS[mail.status]} · an{" "}
                {mail.toEmail}
              </span>
            </li>
          ))}
        </ul>
      )}
      {messages.length === 5 && (
        <p className="mt-3">
          <Link href="/emails" className="text-xs underline">
            Gesamte E-Mail-Historie öffnen
          </Link>
        </p>
      )}
    </SectionCard>
  );
}

// --- Angebote / Rechnungen: offene/neueste 5, Links auf die Detailseiten.
export async function QuotesSection({ scope }: { scope: FileScope }) {
  const { quotes, total } = await listQuotesCompact(scope, 5);
  return (
    <SectionCard
      title="Angebote"
      action={
        <Link href={`/quotes/new?${scopeQuery(scope)}`} className={linkClass}>
          Angebot erstellen
        </Link>
      }
    >
      {quotes.length === 0 ? (
        <Empty>Noch keine Angebote vorhanden.</Empty>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-0.5">
              <Link href={`/quotes/${quote.id}`} className="font-medium text-black hover:underline">
                {quote.quoteNumber}
              </Link>
              <span className="text-xs text-muted">
                {QUOTE_STATUS_LABELS[effectiveQuoteStatus(quote)]} ·{" "}
                {formatCentsAsEuro(quote.totalCents)} · {DATE_UTC.format(quote.issueDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > quotes.length && scope.kind === "company" && (
        <p className="mt-3">
          <Link href={`/quotes?companyId=${scope.id}`} className="text-xs underline">
            Alle {total} Angebote anzeigen
          </Link>
        </p>
      )}
    </SectionCard>
  );
}

export async function InvoicesSection({ scope }: { scope: FileScope }) {
  const { invoices, total } = await listInvoicesCompact(scope, 5);
  return (
    <SectionCard
      title="Rechnungen"
      action={
        <Link href={`/invoices/new?${scopeQuery(scope)}`} className={linkClass}>
          Rechnung erstellen
        </Link>
      }
    >
      {invoices.length === 0 ? (
        <Empty>Noch keine Rechnungen vorhanden.</Empty>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="flex flex-col gap-0.5">
              <Link
                href={`/invoices/${invoice.id}`}
                className="font-medium text-black hover:underline"
              >
                {invoice.invoiceNumber}
              </Link>
              <span className="text-xs text-muted">
                {INVOICE_STATUS_LABELS[effectiveInvoiceStatus(invoice)]} ·{" "}
                {formatCentsAsEuro(invoice.totalCents)} · fällig {DATE_UTC.format(invoice.dueDate)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > invoices.length && scope.kind === "company" && (
        <p className="mt-3">
          <Link href={`/invoices?companyId=${scope.id}`} className="text-xs underline">
            Alle {total} Rechnungen anzeigen
          </Link>
        </p>
      )}
    </SectionCard>
  );
}

// --- Aufgaben (offene, nach Fälligkeit) und kommende Termine.
export async function TasksSection({
  scope,
  assignedUserId,
}: {
  scope: FileScope;
  assignedUserId?: string | null;
}) {
  const { tasks, total } = await listOpenTasksCompact(scope, 5);
  return (
    <SectionCard
      title="Offene Aufgaben"
      action={
        <Link href={`/tasks/new?${scopeQuery(scope, { assignedUserId })}`} className={linkClass}>
          Aufgabe erstellen
        </Link>
      }
    >
      {tasks.length === 0 ? (
        <Empty>Keine offenen Aufgaben.</Empty>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-0.5">
              <Link
                href={`/tasks/${task.id}`}
                className="font-medium break-words text-black hover:underline"
              >
                {task.title}
              </Link>
              <span className="text-xs text-muted">
                <span className={cn(isTaskOverdue(task) && "font-medium text-red-700")}>
                  {isTaskOverdue(task) ? "Überfällig seit " : "Fällig "}
                  {DATE.format(task.dueAt)}
                </span>{" "}
                · {PRIORITY_LABELS[task.priority]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {total > tasks.length && (
        <p className="mt-3 text-xs text-muted">
          {tasks.length} von {total} offenen Aufgaben.
        </p>
      )}
    </SectionCard>
  );
}

export async function EventsSection({
  scope,
  assignedUserId,
}: {
  scope: FileScope;
  assignedUserId?: string | null;
}) {
  const events = await listUpcomingEventsCompact(scope, 5);
  return (
    <SectionCard
      title="Kommende Termine"
      action={
        <Link href={`/calendar/new?${scopeQuery(scope, { assignedUserId })}`} className={linkClass}>
          Termin erstellen
        </Link>
      }
    >
      {events.length === 0 ? (
        <Empty>Keine kommenden Termine.</Empty>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5">
              <Link
                href={`/calendar/${event.id}`}
                className="font-medium break-words text-black hover:underline"
              >
                {event.title}
              </Link>
              <span className="text-xs text-muted">{DATE_TIME.format(event.startsAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// --- Dateien: kleine Liste + Upload.
export async function FilesSection({
  scope,
  user,
  limit = 5,
}: {
  scope: FileScope;
  user: ViewUser;
  limit?: number;
}) {
  const target = { [scopeIdField(scope)]: scope.id } as Record<string, string>;
  const { files, total } = await listFilesForTarget(target, limit);
  return (
    <SectionCard title="Dateien">
      <div className="flex flex-col gap-4">
        {files.length === 0 ? (
          <Empty>Noch keine Dateien vorhanden.</Empty>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <a
                    href={`/api/files/${file.id}`}
                    className="font-medium break-all text-black underline hover:no-underline"
                  >
                    {file.originalName}
                  </a>
                  <span className="text-xs text-muted">
                    {formatFileSize(file.sizeBytes)} · {DATE.format(file.createdAt)} ·{" "}
                    {file.uploadedBy.firstName} {file.uploadedBy.lastName}
                  </span>
                </div>
                {canDeleteFile(user, file) && (
                  <FileDeleteButton fileId={file.id} name={file.originalName} />
                )}
              </li>
            ))}
          </ul>
        )}
        {total > files.length && (
          <p className="text-xs text-muted">
            Die neuesten {files.length} von {total} Dateien.
          </p>
        )}
        <FileUploadForm target={target} />
      </div>
    </SectionCard>
  );
}
