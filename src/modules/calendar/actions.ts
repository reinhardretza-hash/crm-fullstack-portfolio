"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/rbac";
import { AppError } from "@/lib/errors";
import { saveCalendarEvent, changeCalendarEvent } from "./service";
import type { EventStatus } from "./helpers";
export type EventActionState = { error: string | null };
function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  for (const route of [
    "/companies/[id]",
    "/contacts/[id]",
    "/leads/[id]",
    "/deals/[id]",
    "/tasks/[id]",
  ])
    revalidatePath(route, "page");
}
export async function saveEventAction(
  id: string | null,
  _prev: EventActionState,
  form: FormData,
): Promise<EventActionState> {
  const user = await requireUser();
  let eventId: string;
  try {
    const event = await saveCalendarEvent(
      user.id,
      Object.fromEntries(form),
      id ? { id, expectedVersion: Number(form.get("expectedVersion")) } : undefined,
    );
    eventId = event.id;
    refresh();
  } catch (error) {
    return {
      error:
        error instanceof AppError
          ? error.userMessage
          : "Termin konnte nicht gespeichert werden. Bitte Eingaben und Version prüfen.",
    };
  }
  redirect(`/calendar/${eventId}`);
}
export async function changeEventAction(
  id: string,
  expectedVersion: number,
  status: EventStatus | "DELETE",
  _prev: EventActionState,
): Promise<EventActionState> {
  void _prev;
  const user = await requireUser();
  try {
    await changeCalendarEvent(user.id, { id, expectedVersion }, status);
    refresh();
  } catch (error) {
    return {
      error: error instanceof AppError ? error.userMessage : "Termin konnte nicht geändert werden.",
    };
  }
  redirect(status === "DELETE" ? "/calendar" : `/calendar/${id}`);
}
