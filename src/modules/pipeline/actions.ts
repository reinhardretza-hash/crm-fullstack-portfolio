"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { isUniqueConstraintViolation } from "@/lib/prisma-errors";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { writeCrmAuditLog } from "@/modules/audit/log";
import {
  moveStageSchema,
  pipelineStageFormSchemaRefined,
  type PipelineStageFormValues,
} from "@/validations/pipeline-admin";

export type StageFormActionState = { error: string | null };
export type StageActionResult = { success: true } | { success: false; error: string };

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function updateStageAction(
  stageId: string,
  _previousState: StageFormActionState,
  formData: FormData,
): Promise<StageFormActionState> {
  const user = await requireUser();
  requirePermission(user, "PIPELINE_MANAGE");

  const parsed = pipelineStageFormSchemaRefined.safeParse({
    name: str(formData, "name"),
    probability: str(formData, "probability"),
    color: str(formData, "color"),
    isWonStage: str(formData, "isWonStage"),
    isLostStage: str(formData, "isLostStage"),
    expectedVersion: str(formData, "expectedVersion"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data: PipelineStageFormValues = parsed.data;

  try {
    const conflict = await prisma.$transaction(async (tx) => {
      const current = await tx.pipelineStage.findFirst({ where: { id: stageId, deletedAt: null } });
      if (
        current &&
        (current.isWonStage !== data.isWonStage || current.isLostStage !== data.isLostStage)
      ) {
        const count = await tx.lead.count({ where: { stageId, deletedAt: null } });
        if (count > 0)
          throw new AppError(
            "Die Gewonnen-/Verloren-Markierung einer Stufe mit Leads kann nicht geändert werden.",
          );
      }
      // version + deletedAt:null in derselben WHERE-Klausel: eine
      // zwischenzeitlich gelöschte oder parallel geänderte Stufe führt zu
      // count=0, nie zu einer stillen Fehlanwendung (siehe Vorgabe Punkt 31).
      const updateResult = await tx.pipelineStage.updateMany({
        where: { id: stageId, version: data.expectedVersion, deletedAt: null },
        data: {
          name: data.name,
          probability: data.probability ?? null,
          color: data.color ?? null,
          isWonStage: data.isWonStage,
          isLostStage: data.isLostStage,
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) return true;

      await writeCrmAuditLog(tx, {
        action: "PIPELINE_STAGE_UPDATED",
        userId: user.id,
        entityType: "PipelineStage",
        entityId: stageId,
      });
      return false;
    });

    if (conflict) {
      return {
        error:
          "Die Stufe wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return {
        error: "Es darf höchstens eine Gewonnen- bzw. eine Verloren-Stufe je Pipeline geben.",
      };
    }
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Stufe konnte nicht gespeichert werden." };
  }

  revalidatePath("/settings/pipeline");
  revalidatePath("/pipeline");
  redirect("/settings/pipeline");
}

// Move-Up/Move-Down statt vollständigem Drag & Drop für die Admin-Ansicht
// (siehe Vorgabe Punkt 11: beides ist ausdrücklich zulässig) - einfacher zu
// bedienen und zu testen für eine reine Verwaltungsseite. Der eigentliche
// Positions-Tausch läuft über einen temporären Platzhalterwert (-1), weil
// PostgreSQL die partielle Unique-Constraint auf (pipeline_id, position)
// nach JEDEM einzelnen Statement prüft, nicht erst am Transaktionsende -
// ein direktes A<->B-Swap in zwei Updates würde daher kurzzeitig einen
// doppelten Positionswert auslösen und fehlschlagen.
export async function moveStageAction(input: {
  stageId: string;
  direction: "up" | "down";
}): Promise<StageActionResult> {
  const user = await requireUser();
  requirePermission(user, "PIPELINE_MANAGE");

  const parsed = moveStageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { stageId, direction } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const stage = await tx.pipelineStage.findFirst({ where: { id: stageId, deletedAt: null } });
      if (!stage) throw new AppError("Pipeline-Stufe wurde nicht gefunden.");

      const neighbor = await tx.pipelineStage.findFirst({
        where: {
          pipelineId: stage.pipelineId,
          deletedAt: null,
          position: direction === "up" ? { lt: stage.position } : { gt: stage.position },
        },
        orderBy: { position: direction === "up" ? "desc" : "asc" },
      });
      if (!neighbor) {
        throw new AppError("Die Stufe kann nicht weiter in diese Richtung verschoben werden.");
      }

      await tx.pipelineStage.update({ where: { id: stage.id }, data: { position: -1 } });
      await tx.pipelineStage.update({
        where: { id: neighbor.id },
        data: { position: stage.position },
      });
      await tx.pipelineStage.update({
        where: { id: stage.id },
        data: { position: neighbor.position },
      });

      await writeCrmAuditLog(tx, {
        action: "PIPELINE_STAGE_REORDERED",
        userId: user.id,
        entityType: "PipelineStage",
        entityId: stage.id,
        metadata: { fromPosition: stage.position, toPosition: neighbor.position },
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Reihenfolge konnte nicht geändert werden." };
  }

  revalidatePath("/settings/pipeline");
  revalidatePath("/pipeline");
  return { success: true };
}

// Soft Delete, nur wenn keine (nicht gelöschten) Leads mehr auf die Stufe
// verweisen - siehe Vorgabe Punkt 12: Blockierung statt Zielstufen-Auswahl
// für Version 1.
export async function deleteStageAction(stageId: string): Promise<StageActionResult> {
  const user = await requireUser();
  requirePermission(user, "PIPELINE_MANAGE");

  try {
    await prisma.$transaction(async (tx) => {
      const stage = await tx.pipelineStage.findFirst({ where: { id: stageId, deletedAt: null } });
      if (!stage) throw new AppError("Pipeline-Stufe wurde nicht gefunden.");

      const leadCount = await tx.lead.count({ where: { stageId, deletedAt: null } });
      if (leadCount > 0) {
        throw new AppError(
          `Diese Pipeline-Stufe wird noch von ${leadCount} Lead${leadCount === 1 ? "" : "s"} verwendet.`,
        );
      }

      await tx.pipelineStage.update({ where: { id: stageId }, data: { deletedAt: new Date() } });
      await writeCrmAuditLog(tx, {
        action: "PIPELINE_STAGE_DELETED",
        userId: user.id,
        entityType: "PipelineStage",
        entityId: stageId,
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Pipeline-Stufe konnte nicht gelöscht werden." };
  }

  revalidatePath("/settings/pipeline");
  return { success: true };
}

// Da Version 1 nur eine Hauptpipeline kennt, darf die einzige aktive
// Standardpipeline nicht versehentlich deaktiviert werden (siehe Vorgabe
// Punkt 13) - unabhängig davon, ob sie offene Leads hat oder nicht
// (praktisch hat die Standardpipeline so gut wie immer Leads).
export async function togglePipelineActiveAction(
  pipelineId: string,
  isActive: boolean,
): Promise<StageActionResult> {
  const user = await requireUser();
  requirePermission(user, "PIPELINE_MANAGE");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(620007)`;
      const pipeline = await tx.pipeline.findUnique({ where: { id: pipelineId } });
      if (!pipeline) throw new AppError("Pipeline wurde nicht gefunden.");

      if (!isActive && pipeline.isDefault) {
        throw new AppError("Die Standardpipeline kann nicht deaktiviert werden.");
      }

      if (
        !isActive &&
        pipeline.isActive &&
        (await tx.pipeline.count({ where: { isActive: true } })) <= 1
      ) {
        throw new AppError("Die einzige aktive Pipeline kann nicht deaktiviert werden.");
      }
      await tx.pipeline.update({ where: { id: pipelineId }, data: { isActive } });
      await writeCrmAuditLog(tx, {
        action: "PIPELINE_UPDATED",
        userId: user.id,
        entityType: "Pipeline",
        entityId: pipelineId,
        metadata: { isActive },
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }

  revalidatePath("/settings/pipeline");
  return { success: true };
}
