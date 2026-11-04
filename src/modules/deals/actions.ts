"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/rbac";
import {
  dealFormSchema,
  dealLostSchema,
  dealReopenSchema,
  dealWonSchema,
  dealDeleteSchema,
  type DealFormValues,
} from "@/validations/deal";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { logActivity } from "@/modules/activity/log";
import { assertLeadCompanyConsistency } from "./validation";
import { canDeleteDeal, dealLostPatch, dealReopenPatch, dealWonPatch } from "./status";

export type DealActionState = {
  error: string | null;
};

export type DealStatusActionResult =
  { success: true; version: number } | { success: false; error: string };

// Gleiches `FormData.get()`-Null-vs-undefined-Problem wie bei Company/
// Contact/Lead (siehe dortige Kommentare) - derselbe Helper wird hier
// bewusst wiederverwendet statt neu erfunden.
function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function parseFormData(formData: FormData) {
  return {
    name: str(formData, "name"),
    companyId: str(formData, "companyId"),
    contactId: str(formData, "contactId"),
    leadId: str(formData, "leadId"),
    assignedUserId: str(formData, "assignedUserId"),
    service: str(formData, "service"),
    valueCents: str(formData, "valueCents"),
    probability: str(formData, "probability"),
    expectedCloseDate: str(formData, "expectedCloseDate"),
    description: str(formData, "description"),
  };
}

// Zentral statt dupliziert in create/update: lädt den Lead (falls
// angegeben) frisch und prüft die Company-Konsistenz (siehe Vorgabe Punkt
// 9 und src/modules/deals/validation.ts).
async function resolveLeadConsistency(
  tx: Prisma.TransactionClient,
  data: Pick<DealFormValues, "leadId" | "companyId">,
) {
  if (!data.leadId) return;
  const lead = await tx.lead.findFirst({
    where: { id: data.leadId, deletedAt: null },
    select: { companyId: true },
  });
  assertLeadCompanyConsistency(lead, data.companyId);
}

export async function createDealAction(
  _previousState: DealActionState,
  formData: FormData,
): Promise<DealActionState> {
  const user = await requireUser();

  const parsed = dealFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;

  let dealId: string;
  try {
    dealId = await prisma.$transaction(async (tx) => {
      await resolveLeadConsistency(tx, data);

      const deal = await tx.deal.create({
        data: {
          name: data.name,
          companyId: data.companyId,
          contactId: data.contactId,
          leadId: data.leadId,
          assignedUserId: data.assignedUserId,
          service: data.service,
          valueCents: data.valueCents,
          probability: data.probability,
          expectedCloseDate: data.expectedCloseDate,
          description: data.description,
        },
      });

      await logActivity(tx, { type: "DEAL_CREATED", userId: user.id, dealId: deal.id });
      await writeCrmAuditLog(tx, {
        action: "DEAL_CREATED",
        userId: user.id,
        entityType: "Deal",
        entityId: deal.id,
      });

      return deal.id;
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Deal konnte nicht gespeichert werden." };
  }

  redirect(`/deals/${dealId}`);
}

export async function updateDealAction(
  dealId: string,
  _previousState: DealActionState,
  formData: FormData,
): Promise<DealActionState> {
  const user = await requireUser();

  const existing = await prisma.deal.findFirst({ where: { id: dealId, deletedAt: null } });
  if (!existing) {
    return { error: "Deal wurde nicht gefunden." };
  }

  const parsed = dealFormSchema.safeParse(parseFormData(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;

  // Die erwartete Version kommt aus einem versteckten Formularfeld (Stand
  // beim Öffnen des Formulars), NICHT aus einem frischen Read direkt vor der
  // Transaktion - sonst würde die OCC-Prüfung trivial immer passen und einen
  // zwischenzeitlichen Konflikt (z. B. durch Won/Lost in einem anderen Tab)
  // nie erkennen.
  const rawExpectedVersion = str(formData, "expectedVersion");
  const expectedVersion = rawExpectedVersion ? Number.parseInt(rawExpectedVersion, 10) : NaN;
  if (!Number.isInteger(expectedVersion)) {
    return { error: "Ungültige Versionsangabe." };
  }

  try {
    const conflict = await prisma.$transaction(async (tx) => {
      await resolveLeadConsistency(tx, data);

      // Optimistic Concurrency Control auch beim normalen Bearbeiten-Formular
      // (nicht nur beim Statuswechsel) - siehe Vorgabe Punkt 17. Anders als
      // beim Lead (wo nur der Stage-Move OCC nutzt) wird hier bewusst jede
      // Deal-Mutation versioniert, weil Won/Lost/Reopen und das normale
      // Bearbeiten-Formular denselben Datensatz gleichzeitig verändern
      // könnten (z. B. zwei Tabs).
      const updateResult = await tx.deal.updateMany({
        where: { id: dealId, version: expectedVersion, deletedAt: null },
        data: {
          name: data.name,
          companyId: data.companyId,
          contactId: data.contactId,
          leadId: data.leadId,
          assignedUserId: data.assignedUserId,
          service: data.service,
          valueCents: data.valueCents,
          probability: data.probability,
          expectedCloseDate: data.expectedCloseDate,
          description: data.description,
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) return true;

      await logActivity(tx, { type: "DEAL_UPDATED", userId: user.id, dealId });
      await writeCrmAuditLog(tx, {
        action: "DEAL_UPDATED",
        userId: user.id,
        entityType: "Deal",
        entityId: dealId,
      });
      return false;
    });

    if (conflict) {
      return {
        error:
          "Der Deal wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Deal konnte nicht gespeichert werden." };
  }

  redirect(`/deals/${dealId}`);
}

// Soft Delete (siehe Lead/Company/Contact) - kein Activity-Eintrag mit
// eigenem Typ (es gibt kein "DEAL_DELETED" in ActivityType, siehe Vorgabe:
// nur AuditLog listet DEAL_DELETED), sondern DEAL_UPDATED mit Metadata-Flag
// in der fachlichen Timeline - exakt dasselbe Muster wie bei Lead.
export async function deleteDealAction(dealId: string, expectedVersion: number): Promise<void> {
  const user = await requireUser();
  const mutation = dealDeleteSchema.parse({ dealId, expectedVersion });

  await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({ where: { id: mutation.dealId, deletedAt: null } });
    if (!deal) throw new AppError("Datensatz wurde nicht gefunden oder bereits gelöscht.");
    if (!canDeleteDeal(deal.status)) throw new AppError("Nur offene Deals können gelöscht werden.");
    if (deal.version !== mutation.expectedVersion)
      throw new AppError("Der Deal wurde zwischenzeitlich geändert. Bitte die Seite neu laden.");
    const changed = await tx.deal.updateMany({
      where: {
        id: mutation.dealId,
        deletedAt: null,
        status: "OPEN",
        version: mutation.expectedVersion,
      },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1)
      throw new AppError(
        "Der Deal wurde zwischenzeitlich geändert oder gelöscht. Bitte die Seite neu laden.",
      );
    await logActivity(tx, {
      type: "DEAL_UPDATED",
      userId: user.id,
      dealId: mutation.dealId,
      metadata: { softDeleted: true },
    });
    await writeCrmAuditLog(tx, {
      action: "DEAL_DELETED",
      userId: user.id,
      entityType: "Deal",
      entityId: mutation.dealId,
    });
  });

  revalidatePath("/deals");
  revalidatePath("/dashboard");
}

export async function deleteDealFromDetailAction(
  dealId: string,
  expectedVersion: number,
): Promise<DealActionState> {
  try {
    await deleteDealAction(dealId, expectedVersion);
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    throw error;
  }
  redirect("/deals?deleted=1");
}

export async function markDealWonAction(input: {
  dealId: string;
  expectedVersion: number;
}): Promise<DealStatusActionResult> {
  const user = await requireUser();
  const parsed = dealWonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { dealId, expectedVersion } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findFirst({ where: { id: dealId, deletedAt: null } });
      if (!deal) throw new AppError("Deal wurde nicht gefunden.");

      const updateResult = await tx.deal.updateMany({
        where: { id: dealId, version: expectedVersion, deletedAt: null },
        data: { ...dealWonPatch(), version: { increment: 1 } },
      });
      if (updateResult.count === 0) return { conflict: true as const };

      await logActivity(tx, { type: "DEAL_WON", userId: user.id, dealId });
      await writeCrmAuditLog(tx, {
        action: "DEAL_WON",
        userId: user.id,
        entityType: "Deal",
        entityId: dealId,
      });

      return { conflict: false as const, version: expectedVersion + 1 };
    });

    if (outcome.conflict) {
      return {
        success: false,
        error:
          "Der Deal wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }

    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/deals");
    return { success: true, version: outcome.version };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }
}

export async function markDealLostAction(input: {
  dealId: string;
  expectedVersion: number;
  lostReason?: string;
  lostReasonNote?: string;
}): Promise<DealStatusActionResult> {
  const user = await requireUser();
  const parsed = dealLostSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { dealId, expectedVersion, lostReason, lostReasonNote } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findFirst({ where: { id: dealId, deletedAt: null } });
      if (!deal) throw new AppError("Deal wurde nicht gefunden.");

      const updateResult = await tx.deal.updateMany({
        where: { id: dealId, version: expectedVersion, deletedAt: null },
        data: { ...dealLostPatch({ lostReason, lostReasonNote }), version: { increment: 1 } },
      });
      if (updateResult.count === 0) return { conflict: true as const };

      await logActivity(tx, {
        type: "DEAL_LOST",
        userId: user.id,
        dealId,
        metadata: { lostReason: lostReason ?? null },
      });
      await writeCrmAuditLog(tx, {
        action: "DEAL_LOST",
        userId: user.id,
        entityType: "Deal",
        entityId: dealId,
        metadata: { lostReason: lostReason ?? null },
      });

      return { conflict: false as const, version: expectedVersion + 1 };
    });

    if (outcome.conflict) {
      return {
        success: false,
        error:
          "Der Deal wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }

    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/deals");
    return { success: true, version: outcome.version };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }
}

export async function reopenDealAction(input: {
  dealId: string;
  expectedVersion: number;
}): Promise<DealStatusActionResult> {
  const user = await requireUser();
  const parsed = dealReopenSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Ungültige Eingabe." };
  }
  const { dealId, expectedVersion } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findFirst({ where: { id: dealId, deletedAt: null } });
      if (!deal) throw new AppError("Deal wurde nicht gefunden.");

      const updateResult = await tx.deal.updateMany({
        where: { id: dealId, version: expectedVersion, deletedAt: null },
        data: { ...dealReopenPatch(), version: { increment: 1 } },
      });
      if (updateResult.count === 0) return { conflict: true as const };

      await logActivity(tx, { type: "DEAL_REOPENED", userId: user.id, dealId });
      await writeCrmAuditLog(tx, {
        action: "DEAL_REOPENED",
        userId: user.id,
        entityType: "Deal",
        entityId: dealId,
      });

      return { conflict: false as const, version: expectedVersion + 1 };
    });

    if (outcome.conflict) {
      return {
        success: false,
        error:
          "Der Deal wurde zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }

    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/deals");
    return { success: true, version: outcome.version };
  } catch (error) {
    if (error instanceof AppError) return { success: false, error: error.userMessage };
    return { success: false, error: "Status konnte nicht geändert werden." };
  }
}
