"use server";

import { entityIdSchema } from "@/validations/entity";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/rbac";
import { taskFormSchema, taskStatusChangeSchema, type TaskFormValues } from "@/validations/task";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { logActivity } from "@/modules/activity/log";
import { assertAtMostOneCrmTarget } from "./validation";
import { taskCompletePatch, taskReopenPatch } from "./status";

// Berechtigungen (siehe Vorgabe Punkt 36): für Version 1 bewusst keine
// granulare Prüfung über `requireUser()` hinaus. Jeder aktive,
// authentifizierte Benutzer (OWNER/ADMIN/USER) darf Aufgaben erstellen,
// bearbeiten, erledigen und löschen - auch fremd zugewiesene. Ein echtes
// "nur eigene Aufgaben bearbeiten"-Konzept würde ein granulareres
// Permission-System voraussetzen, das es in diesem CRM noch nicht gibt;
// es künstlich nur für Tasks einzuführen wäre inkonsistent zum Rest der
// Anwendung (Company/Contact/Lead/Deal kennen dieselbe Einschränkung
// ebenfalls nicht).
export type TaskActionState = {
  error: string | null;
};

export type TaskStatusActionResult =
  { success: true; version: number } | { success: false; error: string };

// Gleiches `FormData.get()`-Null-vs-undefined-Problem wie bei Company/
// Contact/Lead/Deal - derselbe Helper wird hier bewusst wiederverwendet.
function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseFormData(formData: FormData) {
  return {
    title: str(formData, "title"),
    description: str(formData, "description"),
    assignedUserId: str(formData, "assignedUserId"),
    status: str(formData, "status") || undefined,
    priority: str(formData, "priority") || undefined,
    dueDate: str(formData, "dueDate"),
    dueTime: str(formData, "dueTime"),
    reminderDate: str(formData, "reminderDate"),
    reminderTime: str(formData, "reminderTime"),
    companyId: str(formData, "companyId"),
    contactId: str(formData, "contactId"),
    leadId: str(formData, "leadId"),
    dealId: str(formData, "dealId"),
  };
}

// Nur CREATED/COMPLETED werden zusätzlich in die Timeline der verknüpften
// CRM-Entität gespiegelt (siehe Vorgabe Punkt 34: "keine Timeline-Spam-
// Flut") - UPDATED/REOPENED/REASSIGNED erscheinen nur in der eigenen
// Aufgaben-Timeline (taskId), nicht zusätzlich bei Company/Contact/Lead/Deal.
function crmTargetFields(task: {
  companyId: string | null;
  contactId: string | null;
  leadId: string | null;
  dealId: string | null;
}) {
  return {
    companyId: task.companyId ?? undefined,
    contactId: task.contactId ?? undefined,
    leadId: task.leadId ?? undefined,
    dealId: task.dealId ?? undefined,
  };
}

export async function createTaskAction(
  _previousState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const user = await requireUser();

  const parsed = taskFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;

  let taskId: string;
  try {
    assertAtMostOneCrmTarget(data);

    taskId = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          dueAt: data.dueAt,
          reminderAt: data.reminderAt,
          assignedUserId: data.assignedUserId,
          createdById: user.id,
          companyId: data.companyId,
          contactId: data.contactId,
          leadId: data.leadId,
          dealId: data.dealId,
        },
      });

      await logActivity(tx, {
        type: "TASK_CREATED",
        userId: user.id,
        taskId: task.id,
        ...crmTargetFields(task),
      });
      await writeCrmAuditLog(tx, {
        action: "TASK_CREATED",
        userId: user.id,
        entityType: "Task",
        entityId: task.id,
      });

      return task.id;
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Aufgabe konnte nicht gespeichert werden." };
  }

  redirect(`/tasks/${taskId}`);
}

export async function updateTaskAction(
  taskId: string,
  _previousState: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const user = await requireUser();

  const existing = await prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
  if (!existing) {
    return { error: "Aufgabe wurde nicht gefunden." };
  }

  const parsed = taskFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data: TaskFormValues = parsed.data;

  const rawExpectedVersion = str(formData, "expectedVersion");
  const expectedVersion = rawExpectedVersion ? Number.parseInt(rawExpectedVersion, 10) : NaN;
  if (!Number.isInteger(expectedVersion)) {
    return { error: "Ungültige Versionsangabe." };
  }

  try {
    assertAtMostOneCrmTarget(data);

    const conflict = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.task.updateMany({
        where: { id: taskId, version: expectedVersion, deletedAt: null },
        data: {
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          dueAt: data.dueAt,
          reminderAt: data.reminderAt,
          assignedUserId: data.assignedUserId,
          companyId: data.companyId,
          contactId: data.contactId,
          leadId: data.leadId,
          dealId: data.dealId,
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) return true;

      await logActivity(tx, { type: "TASK_UPDATED", userId: user.id, taskId });
      await writeCrmAuditLog(tx, {
        action: "TASK_UPDATED",
        userId: user.id,
        entityType: "Task",
        entityId: taskId,
      });

      if (existing.assignedUserId !== data.assignedUserId) {
        await logActivity(tx, {
          type: "TASK_REASSIGNED",
          userId: user.id,
          taskId,
          metadata: { fromUserId: existing.assignedUserId, toUserId: data.assignedUserId },
        });
      }

      return false;
    });

    if (conflict) {
      return {
        error:
          "Die Aufgabe wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Aufgabe konnte nicht gespeichert werden." };
  }

  redirect(`/tasks/${taskId}`);
}

// Soft Delete (siehe Lead/Deal) - kein eigener Activity-Typ für "gelöscht"
// (nur AuditLog listet TASK_DELETED), sondern TASK_UPDATED mit Metadata-
// Flag in der eigenen Aufgaben-Timeline - exakt dasselbe Muster wie bei
// Lead/Deal.
export async function deleteTaskAction(taskId: string): Promise<void> {
  const user = await requireUser();
  entityIdSchema.parse(taskId);

  await prisma.$transaction(async (tx) => {
    const changed = await tx.task.updateMany({
      where: { id: taskId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new AppError("Datensatz wurde nicht gefunden oder bereits gelöscht.");
    await logActivity(tx, {
      type: "TASK_UPDATED",
      userId: user.id,
      taskId,
      metadata: { softDeleted: true },
    });
    await writeCrmAuditLog(tx, {
      action: "TASK_DELETED",
      userId: user.id,
      entityType: "Task",
      entityId: taskId,
    });
  });

  revalidatePath("/tasks");
}

// Wird sowohl von der Task-Detailseite als auch von "Quick Complete" in
// Liste/Dashboard aufgerufen (siehe Vorgabe Punkt 18) - immer mit echter
// Auth-Prüfung, Optimistic Concurrency Control und Activity/AuditLog, nie
// eine reine Client-State-Änderung.
export async function completeTaskAction(input: {
  taskId: string;
  expectedVersion: number;
}): Promise<TaskStatusActionResult> {
  const user = await requireUser();
  const parsed = taskStatusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { taskId, expectedVersion } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, deletedAt: null } });
      if (!task) throw new AppError("Aufgabe wurde nicht gefunden.");

      const updateResult = await tx.task.updateMany({
        where: { id: taskId, version: expectedVersion, deletedAt: null },
        data: { ...taskCompletePatch(), version: { increment: 1 } },
      });
      if (updateResult.count === 0) return { conflict: true as const };

      await logActivity(tx, {
        type: "TASK_COMPLETED",
        userId: user.id,
        taskId,
        ...crmTargetFields(task),
      });
      await writeCrmAuditLog(tx, {
        action: "TASK_COMPLETED",
        userId: user.id,
        entityType: "Task",
        entityId: taskId,
      });

      return { conflict: false as const, version: expectedVersion + 1 };
    });

    if (outcome.conflict) {
      return {
        success: false,
        error:
          "Die Aufgabe wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }

    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { success: true, version: outcome.version };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }
}

export async function reopenTaskAction(input: {
  taskId: string;
  expectedVersion: number;
}): Promise<TaskStatusActionResult> {
  const user = await requireUser();
  const parsed = taskStatusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { taskId, expectedVersion } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, deletedAt: null } });
      if (!task) throw new AppError("Aufgabe wurde nicht gefunden.");

      const updateResult = await tx.task.updateMany({
        where: { id: taskId, version: expectedVersion, deletedAt: null },
        data: { ...taskReopenPatch(), version: { increment: 1 } },
      });
      if (updateResult.count === 0) return { conflict: true as const };

      await logActivity(tx, { type: "TASK_REOPENED", userId: user.id, taskId });
      await writeCrmAuditLog(tx, {
        action: "TASK_REOPENED",
        userId: user.id,
        entityType: "Task",
        entityId: taskId,
      });

      return { conflict: false as const, version: expectedVersion + 1 };
    });

    if (outcome.conflict) {
      return {
        success: false,
        error:
          "Die Aufgabe wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }

    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { success: true, version: outcome.version };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }
}
