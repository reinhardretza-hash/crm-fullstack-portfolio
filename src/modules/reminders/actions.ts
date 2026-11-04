"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { reminderSettingsSchema } from "@/validations/reminder";
import { ensureReminderSettings } from "./settings";

export type ReminderSettingsState = { error: string | null; saved?: boolean };

export async function updateReminderSettingsAction(
  _previous: ReminderSettingsState,
  formData: FormData,
): Promise<ReminderSettingsState> {
  const user = await requireUser();
  requirePermission(user, "SETTINGS_MANAGE");

  const get = (key: string) => formData.get(key) ?? undefined;
  const parsed = reminderSettingsSchema.safeParse({
    quoteEnabled: get("quoteEnabled"),
    quoteDays: get("quoteDays"),
    dealEnabled: get("dealEnabled"),
    dealDays: get("dealDays"),
    followUpEnabled: get("followUpEnabled"),
    taskEnabled: get("taskEnabled"),
    invoiceEnabled: get("invoiceEnabled"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }

  const settings = await ensureReminderSettings();
  await prisma.$transaction(async (tx) => {
    await tx.reminderSettings.update({ where: { id: settings.id }, data: parsed.data });
    await writeCrmAuditLog(tx, {
      action: "REMINDER_SETTINGS_UPDATED",
      userId: user.id,
      entityType: "ReminderSettings",
      entityId: settings.id,
      metadata: parsed.data,
    });
  });
  revalidatePath("/settings/reminders");
  return { error: null, saved: true };
}

// Schließt NUR die Erinnerung; der Fachdatensatz bleibt unverändert.
export async function dismissReminderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder || reminder.status === "RESOLVED") return;
  // USER nur eigene; OWNER/ADMIN alle (kein NO_ASSIGNEE-Zugriff für USER).
  if (user.role === "USER" && reminder.assignedUserId !== user.id) return;

  await prisma.reminder.updateMany({
    where: { id, status: { not: "RESOLVED" } },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  revalidatePath("/dashboard");
}
