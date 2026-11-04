import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { EmailContext } from "@/validations/email";
import { upcomingCalendarEvents } from "../queries";
import { EventList } from "./event-list";
export async function CalendarContextSection({
  context,
  assignedUserId,
}: {
  context: EmailContext;
  assignedUserId?: string | null;
}) {
  const events = await upcomingCalendarEvents(context);
  const params = new URLSearchParams(
    Object.entries({ ...context, assignedUserId }).filter(
      (entry): entry is [string, string] => !!entry[1],
    ),
  );
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Kommende Termine</CardTitle>
        <Link href={`/calendar/new?${params}`} className="text-sm underline">
          Termin erstellen
        </Link>
      </CardHeader>
      <CardContent>
        <EventList events={events} />
      </CardContent>
    </Card>
  );
}
