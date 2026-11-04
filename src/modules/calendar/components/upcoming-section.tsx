import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { upcomingCalendarEvents } from "../queries";
import { EventList } from "./event-list";
export async function UpcomingEventsSection() {
  const events = await upcomingCalendarEvents();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Nächste Termine</CardTitle>
        <Link href="/calendar" className="text-sm underline">
          Kalender öffnen
        </Link>
      </CardHeader>
      <CardContent>
        <EventList events={events} />
      </CardContent>
    </Card>
  );
}
