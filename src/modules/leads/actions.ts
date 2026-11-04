"use server";

import { entityIdSchema } from "@/validations/entity";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/rbac";
import { leadFormSchema, stageMoveSchema, type LeadFormValues } from "@/validations/lead";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { logActivity } from "@/modules/activity/log";
import { calculateLeadScore } from "./score";
import { getLeadScoreRules } from "./score-rules";
import { deriveLeadStatusFromStage } from "./stage-status";
import { z } from "zod";

export type LeadActionState = {
  error: string | null;
};

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseFormData(formData: FormData) {
  return {
    title: str(formData, "title"),
    companyId: str(formData, "companyId"),
    contactId: str(formData, "contactId"),
    pipelineId: str(formData, "pipelineId"),
    stageId: str(formData, "stageId"),
    source: str(formData, "source") || undefined,
    interest: str(formData, "interest") || undefined,
    expectedValueCents: str(formData, "expectedValueCents"),
    priority: str(formData, "priority") || undefined,
    probability: str(formData, "probability"),
    assignedUserId: str(formData, "assignedUserId"),
    nextFollowUpAt: str(formData, "nextFollowUpAt"),
    description: str(formData, "description"),
  };
}

// Zentral statt dupliziert in create/update: lädt die Stage frisch, prüft,
// dass sie zur angegebenen Pipeline gehört, und berechnet Score + Status.
async function resolveStageAndScore(
  tx: Prisma.TransactionClient,
  data: Pick<LeadFormValues, "pipelineId" | "stageId" | "companyId" | "source" | "interest">,
) {
  const stage = await tx.pipelineStage.findFirst({ where: { id: data.stageId, deletedAt: null } });
  if (!stage) {
    throw new AppError("Pipeline-Stufe wurde nicht gefunden.");
  }
  if (stage.pipelineId !== data.pipelineId) {
    throw new AppError("Die gewählte Stufe gehört nicht zur gewählten Pipeline.");
  }

  const company = data.companyId
    ? await tx.company.findFirst({
        where: { id: data.companyId },
        select: { country: true, companySize: true },
      })
    : null;

  const rules = await getLeadScoreRules(tx);
  const score = calculateLeadScore(
    {
      source: data.source ?? null,
      interest: data.interest ?? null,
      company,
    },
    rules,
  );

  return { stage, score };
}

export async function createLeadAction(
  _previousState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireUser();

  const parsed = leadFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;

  let leadId: string;
  try {
    leadId = await prisma.$transaction(async (tx) => {
      const { stage, score } = await resolveStageAndScore(tx, data);
      const status = deriveLeadStatusFromStage(stage);

      const lead = await tx.lead.create({
        data: {
          title: data.title,
          companyId: data.companyId,
          contactId: data.contactId,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          source: data.source,
          interest: data.interest,
          expectedValueCents: data.expectedValueCents,
          priority: data.priority,
          probability: data.probability,
          assignedUserId: data.assignedUserId,
          nextFollowUpAt: data.nextFollowUpAt,
          description: data.description,
          status,
          score: score.total,
        },
      });

      await logActivity(tx, { type: "LEAD_CREATED", userId: user.id, leadId: lead.id });
      await writeCrmAuditLog(tx, {
        action: "LEAD_CREATED",
        userId: user.id,
        entityType: "Lead",
        entityId: lead.id,
      });

      return lead.id;
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Lead konnte nicht gespeichert werden." };
  }

  redirect(`/leads/${leadId}`);
}

export async function updateLeadAction(
  leadId: string,
  _previousState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireUser();

  const existing = await prisma.lead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!existing) {
    return { error: "Lead wurde nicht gefunden." };
  }

  const parsed = leadFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;
  const version = z.coerce.number().int().positive().safeParse(str(formData, "expectedVersion"));
  if (!version.success) return { error: "Ungültige Lead-Version. Bitte Seite neu laden." };

  try {
    await prisma.$transaction(async (tx) => {
      const { stage, score } = await resolveStageAndScore(tx, data);
      const status = deriveLeadStatusFromStage(stage);

      const changed = await tx.lead.updateMany({
        where: { id: leadId, deletedAt: null, version: version.data },
        data: {
          title: data.title,
          companyId: data.companyId,
          contactId: data.contactId,
          pipelineId: data.pipelineId,
          stageId: data.stageId,
          source: data.source,
          interest: data.interest,
          expectedValueCents: data.expectedValueCents,
          priority: data.priority,
          probability: data.probability,
          assignedUserId: data.assignedUserId,
          nextFollowUpAt: data.nextFollowUpAt,
          description: data.description,
          status,
          score: score.total,
          version: { increment: 1 },
        },
      });

      if (changed.count !== 1)
        throw new AppError("Der Lead wurde zwischenzeitlich geändert. Bitte Seite neu laden.");
      await logActivity(tx, { type: "LEAD_UPDATED", userId: user.id, leadId });
      await writeCrmAuditLog(tx, {
        action: "LEAD_UPDATED",
        userId: user.id,
        entityType: "Lead",
        entityId: leadId,
      });
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Lead konnte nicht gespeichert werden." };
  }

  redirect(`/leads/${leadId}`);
}

export async function deleteLeadAction(leadId: string): Promise<void> {
  const user = await requireUser();
  entityIdSchema.parse(leadId);

  await prisma.$transaction(async (tx) => {
    const changed = await tx.lead.updateMany({
      where: { id: leadId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new AppError("Datensatz wurde nicht gefunden oder bereits gelöscht.");
    await logActivity(tx, {
      type: "LEAD_UPDATED",
      userId: user.id,
      leadId,
      metadata: { softDeleted: true },
    });
    await writeCrmAuditLog(tx, {
      action: "LEAD_DELETED",
      userId: user.id,
      entityType: "Lead",
      entityId: leadId,
    });
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");
}

export type StageMoveResult =
  { success: true; version: number } | { success: false; error: string };

// Drag & Drop ruft diese Server Action auf (siehe Vorgabe: UI darf
// optimistisch reagieren, aber der Server ist die einzige Quelle der
// Wahrheit). Optimistic Concurrency Control über `version`: Siehe
// ausführliche Begründung in schema.prisma beim Lead-Model.
export async function moveLeadStageAction(input: {
  leadId: string;
  toStageId: string;
  expectedVersion: number;
}): Promise<StageMoveResult> {
  const user = await requireUser();

  const parsed = stageMoveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { leadId, toStageId, expectedVersion } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, deletedAt: null },
        include: { stage: true },
      });
      if (!lead) {
        throw new AppError("Lead wurde nicht gefunden.");
      }

      const toStage = await tx.pipelineStage.findFirst({
        where: { id: toStageId, deletedAt: null },
        include: { pipeline: { select: { isActive: true } } },
      });
      if (!toStage) {
        throw new AppError("Pipeline-Stufe wurde nicht gefunden.");
      }
      if (toStage.pipelineId !== lead.pipelineId) {
        throw new AppError("Die Stufe gehört nicht zur Pipeline dieses Leads.");
      }
      // Lead und Ziel-Stufe gehören zwingend zur selben Pipeline (siehe
      // Prüfung oben) - die Aktivität der Pipeline selbst wird daher über
      // toStage.pipeline mitgeprüft, ohne einen zweiten Query zu brauchen.
      if (!toStage.pipeline.isActive) {
        throw new AppError("Diese Pipeline ist deaktiviert und kann nicht mehr bearbeitet werden.");
      }

      const previousStatus = lead.status;
      const nextStatus = deriveLeadStatusFromStage(toStage);

      // Optimistic Concurrency Control: nur wenn die Version noch mit der
      // erwarteten übereinstimmt, wird überhaupt etwas geändert. 0
      // betroffene Zeilen => ein anderer Request war schneller (Conflict).
      const updateResult = await tx.lead.updateMany({
        where: { id: leadId, version: expectedVersion },
        data: { stageId: toStage.id, status: nextStatus, version: { increment: 1 } },
      });

      if (updateResult.count === 0) {
        return { conflict: true as const };
      }

      const fromStage = lead.stage;
      await logActivity(tx, {
        type: "LEAD_STAGE_CHANGED",
        userId: user.id,
        leadId,
        metadata: {
          fromStageId: fromStage.id,
          toStageId: toStage.id,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
        },
      });
      await writeCrmAuditLog(tx, {
        action: "LEAD_STAGE_CHANGED",
        userId: user.id,
        entityType: "Lead",
        entityId: leadId,
        metadata: { fromStageId: fromStage.id, toStageId: toStage.id },
      });

      // Won/Lost sind keine Einbahnstraße: aus Won/Lost zurück in eine
      // normale Stufe setzt den Status wieder auf OPEN (bereits durch
      // deriveLeadStatusFromStage abgedeckt) - hier nur die zusätzlichen
      // LEAD_WON/LEAD_LOST-Einträge beim tatsächlichen Übergang IN die Stufe.
      if (nextStatus === "WON" && previousStatus !== "WON") {
        await logActivity(tx, { type: "LEAD_WON", userId: user.id, leadId });
        await writeCrmAuditLog(tx, {
          action: "LEAD_WON",
          userId: user.id,
          entityType: "Lead",
          entityId: leadId,
        });
      }
      if (nextStatus === "LOST" && previousStatus !== "LOST") {
        await logActivity(tx, { type: "LEAD_LOST", userId: user.id, leadId });
        await writeCrmAuditLog(tx, {
          action: "LEAD_LOST",
          userId: user.id,
          entityType: "Lead",
          entityId: leadId,
        });
      }

      return { conflict: false as const, version: expectedVersion + 1 };
    });

    if (outcome.conflict) {
      return {
        success: false,
        error:
          "Der Lead wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }

    revalidatePath("/pipeline");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/leads");
    return { success: true, version: outcome.version };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Stufe konnte nicht geändert werden." };
  }
}

export async function setLeadFollowUpAction(
  leadId: string,
  _previousState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const user = await requireUser();

  const raw = str(formData, "nextFollowUpAt");
  const nextFollowUpAt = raw ? new Date(raw) : null;
  if (raw && Number.isNaN(nextFollowUpAt?.getTime())) {
    return { error: "Bitte ein gültiges Datum angeben." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.lead.findFirst({
        where: { id: leadId },
        select: { nextFollowUpAt: true },
      });
      await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpAt } });
      // Altes/neues Datum in der Activity-Metadata (siehe Vorgabe Punkt 28)
      // - strukturiert statt nur Text, damit ein späteres Follow-up-
      // Reporting daraus ablesen kann, wie oft/wie weit verschoben wurde.
      await logActivity(tx, {
        type: "LEAD_FOLLOW_UP_CHANGED",
        userId: user.id,
        leadId,
        metadata: {
          oldFollowUpAt: existing?.nextFollowUpAt?.toISOString() ?? null,
          newFollowUpAt: nextFollowUpAt?.toISOString() ?? null,
        },
      });
    });
  } catch {
    return { error: "Follow-up konnte nicht gespeichert werden." };
  }

  revalidatePath(`/leads/${leadId}`);
  return { error: null };
}
