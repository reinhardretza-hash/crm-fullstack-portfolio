import { addCalendarDays, dateKeyInTimeZone, strictBerlinTimeToUtc } from "@/lib/timezone";
export const EVENT_STATUS_LABELS = {
  SCHEDULED: "Geplant",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgesagt",
} as const;
export type EventStatus = keyof typeof EVENT_STATUS_LABELS;
export function canTransitionEvent(from: EventStatus, to: EventStatus) {
  return from !== to && (from === "SCHEDULED" || to === "SCHEDULED");
}
export function eventsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
) {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}
export function monthDays(date: string) {
  const first = `${date.slice(0, 7)}-01`;
  const next = new Date(`${first}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const start = addCalendarDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
  const days: string[] = [];
  for (let day = start; day < end || days.length % 7 !== 0; day = addCalendarDays(day, 1))
    days.push(day);
  return days;
}
export function calendarDayInterval(date: string) {
  return {
    startsAt: strictBerlinTimeToUtc(date, "00:00"),
    endsAt: strictBerlinTimeToUtc(addCalendarDays(date, 1), "00:00"),
  };
}
export function formatEventWhen(event: { startsAt: Date; endsAt: Date; allDay: boolean }) {
  const fmt = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    ...(event.allDay ? {} : { timeStyle: "short" as const }),
  });
  const end = event.allDay ? new Date(event.endsAt.getTime() - 1) : event.endsAt;
  return `${fmt.format(event.startsAt)} – ${fmt.format(end)}${event.allDay ? " · Ganztägig" : ""}`;
}
export function formatDuration(event: { startsAt: Date; endsAt: Date; allDay: boolean }) {
  if (event.allDay) {
    const first = dateKeyInTimeZone(event.startsAt),
      end = dateKeyInTimeZone(event.endsAt);
    const days = Math.round(
      (new Date(`${end}T12:00Z`).getTime() - new Date(`${first}T12:00Z`).getTime()) / 86400000,
    );
    return `${days} ${days === 1 ? "Tag" : "Tage"}`;
  }
  const minutes = Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60000);
  return [
    minutes >= 60 ? `${Math.floor(minutes / 60)} Std.` : "",
    minutes % 60 ? `${minutes % 60} Min.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
