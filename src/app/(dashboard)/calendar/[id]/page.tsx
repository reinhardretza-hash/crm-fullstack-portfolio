import Link from "next/link";
import { notFound } from "next/navigation";
import { getCalendarEvent, findCalendarOverlaps } from "@/modules/calendar/queries";
import { formatEventWhen, formatDuration, EVENT_STATUS_LABELS } from "@/modules/calendar/helpers";
import { EventActions } from "@/modules/calendar/components/event-actions";
import { Timeline } from "@/modules/activity/components/timeline";
export const metadata = { title: "Termin – RDEvolution CRM" };
export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    event = await getCalendarEvent(id);
  if (!event) notFound();
  const overlaps = event.status === "SCHEDULED" ? await findCalendarOverlaps(event) : [];
  const links = [
    event.company && {
      href: `/companies/${event.company.id}`,
      label: `Unternehmen: ${event.company.name}`,
    },
    event.contact && {
      href: `/contacts/${event.contact.id}`,
      label: `Kontakt: ${[event.contact.firstName, event.contact.lastName].filter(Boolean).join(" ")}`,
    },
    event.lead && { href: `/leads/${event.lead.id}`, label: `Lead: ${event.lead.title}` },
    event.deal && { href: `/deals/${event.deal.id}`, label: `Deal: ${event.deal.name}` },
    event.task && { href: `/tasks/${event.task.id}`, label: `Aufgabe: ${event.task.title}` },
  ].filter((x) => !!x);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="break-words text-lg font-semibold">{event.title}</h2>
        <Link className="text-sm underline" href={`/calendar/${id}/edit`}>
          Bearbeiten
        </Link>
      </div>
      {overlaps.length > 0 && (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm">
          Zu diesem Zeitpunkt besteht bereits ein anderer Termin für denselben Verantwortlichen. Die
          Überschneidung ist ein Hinweis und keine Buchungssperre.
        </p>
      )}
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {[
          ["Status", EVENT_STATUS_LABELS[event.status]],
          ["Datum / Uhrzeit", formatEventWhen(event)],
          ["Dauer", formatDuration(event)],
          ["Ort", event.location || "–"],
          ["Verantwortlicher", `${event.assignedUser.firstName} ${event.assignedUser.lastName}`],
          ["Ersteller", `${event.createdBy.firstName} ${event.createdBy.lastName}`],
        ].map(([key, value]) => (
          <div key={key}>
            <dt className="text-muted">{key}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="whitespace-pre-wrap break-words text-sm">
        {event.description || "Keine Beschreibung."}
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <Link className="underline" href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
      <EventActions id={id} version={event.version} status={event.status} />
      <h3 className="font-medium">Terminaktivitäten</h3>
      <Timeline activities={event.activities} />
      <Link href="/calendar" className="text-sm underline">
        Zum Kalender
      </Link>
    </div>
  );
}
