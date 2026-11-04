import { notFound } from "next/navigation";
import { getCalendarEvent, calendarFormOptions } from "@/modules/calendar/queries";
import { EventForm } from "@/modules/calendar/components/event-form";
import { splitUtcToBerlinDateAndTime } from "@/lib/timezone";
export const metadata = { title: "Termin bearbeiten – RDEvolution CRM" };
export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, options] = await Promise.all([getCalendarEvent(id), calendarFormOptions()]);
  if (!event) notFound();
  const start = splitUtcToBerlinDateAndTime(event.startsAt),
    end = splitUtcToBerlinDateAndTime(
      event.allDay ? new Date(event.endsAt.getTime() - 1) : event.endsAt,
    );
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">Termin bearbeiten</h2>
      <EventForm
        options={options}
        defaults={{
          ...event,
          startDate: start.dateStr,
          endDate: end.dateStr,
          startTime: start.timeStr,
          endTime: end.timeStr,
        }}
      />
    </div>
  );
}
