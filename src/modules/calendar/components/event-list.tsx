import Link from "next/link";
import type { listCalendarEvents } from "../queries";
import { formatEventWhen, EVENT_STATUS_LABELS } from "../helpers";
export type EventSummary = Awaited<ReturnType<typeof listCalendarEvents>>["events"][number];
export function eventContextLabel(event: EventSummary) {
  return (
    event.deal?.name ||
    event.lead?.title ||
    (event.contact
      ? [event.contact.firstName, event.contact.lastName].filter(Boolean).join(" ")
      : "") ||
    event.company?.name ||
    "Ohne CRM-Kontext"
  );
}
export function EventList({ events }: { events: EventSummary[] }) {
  if (!events.length)
    return <p className="text-sm text-muted">Keine Termine in dieser Auswahl.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => (
        <li key={event.id} className="min-w-0 rounded-md border border-black/10 p-3 text-sm">
          <Link className="break-words font-medium underline" href={`/calendar/${event.id}`}>
            {event.title}
          </Link>
          <p>
            {formatEventWhen(event)} · {EVENT_STATUS_LABELS[event.status]}
          </p>
          <p className="break-words text-xs text-muted">
            {event.assignedUser.firstName} {event.assignedUser.lastName} ·{" "}
            {eventContextLabel(event)}
          </p>
        </li>
      ))}
    </ul>
  );
}
