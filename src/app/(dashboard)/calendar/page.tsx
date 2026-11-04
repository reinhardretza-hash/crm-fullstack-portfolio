import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { calendarFiltersSchema } from "@/validations/calendar";
import { listCalendarEvents } from "@/modules/calendar/queries";
import { EventList, eventContextLabel } from "@/modules/calendar/components/event-list";
import {
  monthDays,
  calendarDayInterval,
  eventsOverlap,
  EVENT_STATUS_LABELS,
} from "@/modules/calendar/helpers";
import { dateKeyInTimeZone, splitUtcToBerlinDateAndTime } from "@/lib/timezone";
import { parsePaginationParams } from "@/lib/pagination";
import { PaginationControls } from "@/components/filters/pagination-controls";
export const metadata = { title: "Kalender – RDEvolution CRM" };
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const raw = await searchParams;
  const values = Object.fromEntries(
    Object.entries(raw).map(([key, v]) => [key, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = calendarFiltersSchema.safeParse(values),
    filters = parsed.success ? parsed.data : calendarFiltersSchema.parse({});
  const date = filters.date || dateKeyInTimeZone(new Date()),
    days = monthDays(date),
    pagination = parsePaginationParams(raw);
  const interval =
    filters.view === "month"
      ? {
          startsAt: calendarDayInterval(days[0]).startsAt,
          endsAt: calendarDayInterval(days[days.length - 1]).endsAt,
        }
      : undefined;
  const [{ events, totalCount, totalPages }, users] = await Promise.all([
    listCalendarEvents(filters, pagination, interval),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  const href = (change: Record<string, string>) => {
    const p = new URLSearchParams(
      Object.entries(values).filter((x): x is [string, string] => !!x[1]),
    );
    p.delete("page");
    for (const [k, v] of Object.entries(change)) p.set(k, v);
    return `/calendar?${p}`;
  };
  const shifted = (amount: number) => {
    const d = new Date(`${date.slice(0, 7)}-01T12:00Z`);
    d.setUTCMonth(d.getUTCMonth() + amount);
    return d.toISOString().slice(0, 10);
  };
  const cls = "block max-w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm";
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Kalender</h2>
        <Link href="/calendar/new" className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm">
          Termin erstellen
        </Link>
      </div>
      <nav aria-label="Kalenderansichten" className="flex flex-wrap gap-3 text-sm">
        {[
          ["month", "Monat"],
          ["agenda", "Agenda"],
        ].map(([view, label]) => (
          <Link
            key={view}
            aria-current={filters.view === view ? "page" : undefined}
            className={filters.view === view ? "font-semibold underline" : "underline"}
            href={href({ view })}
          >
            {label}
          </Link>
        ))}
        <Link
          href={href({ scope: "mine" })}
          className={filters.scope === "mine" ? "font-semibold underline" : "underline"}
        >
          Meine Termine
        </Link>
        <Link
          href={href({ scope: "all" })}
          className={filters.scope === "all" ? "font-semibold underline" : "underline"}
        >
          Alle Termine
        </Link>
      </nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={filters.view} />
        <input type="hidden" name="scope" value={filters.scope} />
        {filters.view === "month" && (
          <label className="text-xs">
            Kalenderdatum
            <input name="date" type="date" defaultValue={date} className={cls} />
          </label>
        )}
        <label className="text-xs">
          Suche
          <input
            name="q"
            defaultValue={values.q}
            placeholder="Titel oder CRM-Kontext"
            maxLength={200}
            className={cls}
          />
        </label>
        <label className="text-xs">
          Benutzer
          <select name="userId" defaultValue={filters.userId || ""} className={cls}>
            <option value="">Alle</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Status
          <select name="status" defaultValue={filters.status || ""} className={cls}>
            <option value="">Alle</option>
            {Object.entries(EVENT_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          CRM-Typ
          <select name="crmType" defaultValue={filters.crmType || ""} className={cls}>
            <option value="">Alle</option>
            {[
              ["company", "Unternehmen"],
              ["contact", "Kontakt"],
              ["lead", "Lead"],
              ["deal", "Deal"],
              ["none", "Ohne CRM-Kontext"],
            ].map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Von
          <input name="dateFrom" type="date" defaultValue={filters.dateFrom} className={cls} />
        </label>
        <label className="text-xs">
          Bis
          <input name="dateTo" type="date" defaultValue={filters.dateTo} className={cls} />
        </label>
        <button className={cls}>Filtern</button>
        <Link className="text-sm underline" href="/calendar">
          Zurücksetzen
        </Link>
      </form>
      {!parsed.success && (
        <p role="alert" className="text-sm text-red-700">
          Bitte Filter prüfen: {parsed.error.issues[0]?.message}
        </p>
      )}
      {filters.view === "agenda" ? (
        <>
          <EventList events={events} />
          <Suspense>
            <PaginationControls
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
            />
          </Suspense>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link aria-label="Vorheriger Monat" href={href({ date: shifted(-1) })}>
              ← Zurück
            </Link>
            <h3 className="font-medium">
              {new Intl.DateTimeFormat("de-DE", {
                month: "long",
                year: "numeric",
                timeZone: "Europe/Berlin",
              }).format(new Date(`${date}T12:00Z`))}
            </h3>
            <Link href={href({ date: dateKeyInTimeZone(new Date()) })}>Heute</Link>
            <Link aria-label="Nächster Monat" href={href({ date: shifted(1) })}>
              Weiter →
            </Link>
          </div>
          <p className="text-xs text-muted">
            Am Handy ist das Monatsraster horizontal scrollbar; die Agenda bietet eine kompakte
            Liste.
          </p>
          <div
            className="max-w-full overflow-x-auto rounded-md border border-black/10"
            tabIndex={0}
            aria-label="Monatskalender, horizontal scrollbar"
          >
            <div className="grid min-w-[760px] grid-cols-7">
              {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
                <div
                  key={day}
                  className="border-b border-black/10 p-2 text-center text-xs font-medium"
                >
                  {day}
                </div>
              ))}
              {days.map((day) => {
                const dayInterval = calendarDayInterval(day);
                const dayEvents = events.filter((e) => eventsOverlap(e, dayInterval));
                return (
                  <section
                    key={day}
                    aria-label={day}
                    className={`min-h-28 min-w-0 border-b border-r border-black/10 p-2 ${day.slice(0, 7) !== date.slice(0, 7) ? "bg-black/[0.03]" : ""}`}
                  >
                    <Link
                      className="text-xs underline"
                      href={`/calendar/new?date=${day}`}
                      aria-label={`Termin am ${day} erstellen`}
                    >
                      {Number(day.slice(8))}
                    </Link>
                    <ul className="mt-2 flex flex-col gap-2">
                      {dayEvents.slice(0, 3).map((event) => (
                        <li key={event.id} className="rounded bg-[var(--gold)]/15 p-1 text-xs">
                          <Link
                            href={`/calendar/${event.id}`}
                            className="block break-words font-medium"
                          >
                            {event.title}
                          </Link>
                          <span>
                            {event.allDay
                              ? "Ganztägig"
                              : `${dateKeyInTimeZone(event.startsAt) === day ? splitUtcToBerlinDateAndTime(event.startsAt).timeStr : "Fortsetzung"}`}{" "}
                            · {EVENT_STATUS_LABELS[event.status]}
                          </span>
                          <p className="break-words text-secondary">
                            {event.assignedUser.firstName} {event.assignedUser.lastName}
                          </p>
                          <p className="break-words text-secondary">{eventContextLabel(event)}</p>
                        </li>
                      ))}
                    </ul>
                    {dayEvents.length > 3 && (
                      <Link
                        href={href({ view: "agenda", dateFrom: day, dateTo: day })}
                        className="text-xs underline"
                      >
                        Alle {dayEvents.length} Termine
                      </Link>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
          {totalCount > 500 && (
            <p role="status" className="text-sm">
              Es werden die ersten 500 Termine angezeigt. Bitte die Agenda oder Filter verwenden.
            </p>
          )}
        </>
      )}
    </div>
  );
}
