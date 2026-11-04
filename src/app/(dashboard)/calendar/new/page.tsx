import { requireUser } from "@/server/rbac";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { emailContextSchema } from "@/validations/email";
import { calendarDateSchema } from "@/validations/calendar";
import { resolveEmailContext } from "@/modules/email/context";
import { calendarFormOptions } from "@/modules/calendar/queries";
import { EventForm, type EventDefaults } from "@/modules/calendar/components/event-form";
import { dateKeyInTimeZone } from "@/lib/timezone";
export const metadata = { title: "Termin erstellen – RDEvolution CRM" };
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(),
    raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([key, v]) => [key, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = emailContextSchema.safeParse(params),
    options = await calendarFormOptions();
  let context: Awaited<ReturnType<typeof resolveEmailContext>> | undefined,
    error: string | undefined;
  try {
    if (!parsed.success) throw new AppError("Ungültiger CRM-Kontext.");
    context = await resolveEmailContext(prisma, parsed.data);
  } catch (err) {
    error = err instanceof AppError ? err.userMessage : "CRM-Kontext nicht verfügbar.";
  }
  if (!context) return <p role="alert">{error}</p>;
  const candidate = context.deal
    ? await prisma.deal.findUnique({
        where: { id: context.deal.id },
        select: { assignedUserId: true },
      })
    : context.lead
      ? await prisma.lead.findUnique({
          where: { id: context.lead.id },
          select: { assignedUserId: true },
        })
      : null;
  const assigned =
    [params.assignedUserId, candidate?.assignedUserId, user.id].find((id) =>
      options.users.some((u) => u.id === id),
    ) || user.id;
  const parsedDate = calendarDateSchema.safeParse(params.date);
  const date = parsedDate.success ? parsedDate.data : dateKeyInTimeZone(new Date());
  const defaults: EventDefaults = {
    ...context.context,
    assignedUserId: assigned,
    startDate: date,
    endDate: date,
    startTime: "09:00",
    endTime: "10:00",
    taskId:
      params.taskId && options.tasks.some((t) => t.id === params.taskId)
        ? params.taskId
        : undefined,
  };
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">Termin erstellen</h2>
      <EventForm options={options} defaults={defaults} />
    </div>
  );
}
