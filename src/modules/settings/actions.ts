"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/server/rbac";
import { requirePermission } from "@/server/permissions";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { settingsFormSchema } from "@/validations/settings";
import { ensureSystemSettings } from "./queries";

export type SettingsActionState = { error: string | null };

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

// Siehe schema.prisma/SystemSettings: KEIN eigenes defaultPipelineId-Feld -
// die Standardpipeline bleibt über Pipeline.isDefault abgebildet. Diese
// Action ändert daher zwei Dinge in einer Transaktion: die
// SystemSettings-Zeile UND (falls geändert) welche Pipeline isDefault
// trägt - niemals getrennt, damit kein Zwischenzustand ohne jede
// Standardpipeline entstehen kann.
export async function updateSettingsAction(
  _previousState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const user = await requireUser();
  requirePermission(user, "SETTINGS_MANAGE");

  const parsed = settingsFormSchema.safeParse({
    legalCompanyName: str(formData, "legalCompanyName"),
    street: str(formData, "street"),
    postalCode: str(formData, "postalCode"),
    city: str(formData, "city"),
    country: str(formData, "country"),
    vatId: str(formData, "vatId"),
    taxNumber: str(formData, "taxNumber"),
    iban: str(formData, "iban"),
    bic: str(formData, "bic"),
    bankName: str(formData, "bankName"),
    defaultPaymentTermDays: str(formData, "defaultPaymentTermDays"),
    companyName: str(formData, "companyName"),
    timezone: str(formData, "timezone"),
    currency: str(formData, "currency"),
    defaultPipelineId: str(formData, "defaultPipelineId"),
    expectedVersion: str(formData, "expectedVersion"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Bitte die Eingaben prüfen." };
  }
  const data = parsed.data;

  try {
    const conflict = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(620007)`;
      const settings = await ensureSystemSettings(tx);

      const updateResult = await tx.systemSettings.updateMany({
        where: { id: settings.id, version: data.expectedVersion },
        data: {
          legalCompanyName: data.legalCompanyName,
          street: data.street,
          postalCode: data.postalCode,
          city: data.city,
          country: data.country,
          vatId: data.vatId,
          taxNumber: data.taxNumber,
          iban: data.iban,
          bic: data.bic,
          bankName: data.bankName,
          defaultPaymentTermDays: data.defaultPaymentTermDays,
          companyName: data.companyName,
          timezone: data.timezone,
          currency: data.currency,
          version: { increment: 1 },
        },
      });
      if (updateResult.count === 0) return true;

      const targetPipeline = await tx.pipeline.findUnique({
        where: { id: data.defaultPipelineId },
      });
      if (!targetPipeline) {
        throw new AppError("Die gewählte Standard-Pipeline wurde nicht gefunden.");
      }
      if (!targetPipeline.isActive) {
        throw new AppError("Die Standardpipeline muss aktiv sein.");
      }
      if (!targetPipeline.isDefault) {
        const currentDefault = await tx.pipeline.findFirst({ where: { isDefault: true } });
        // Reihenfolge wichtig: zuerst die alte Standardpipeline zurücksetzen,
        // dann die neue setzen - beide Schritte sequentiell in derselben
        // Transaktion, damit nie zwei Pipelines gleichzeitig isDefault=true
        // tragen (siehe partieller Unique-Index aus Phase 3).
        if (currentDefault) {
          await tx.pipeline.update({
            where: { id: currentDefault.id },
            data: { isDefault: false },
          });
        }
        await tx.pipeline.update({ where: { id: targetPipeline.id }, data: { isDefault: true } });
      }

      await writeCrmAuditLog(tx, {
        action: "SETTINGS_UPDATED",
        userId: user.id,
        entityType: "SystemSettings",
        entityId: settings.id,
      });
      return false;
    });

    if (conflict) {
      return {
        error:
          "Die Einstellungen wurden zwischenzeitlich von jemand anderem geändert. Bitte die Seite neu laden.",
      };
    }
  } catch (error) {
    if (error instanceof AppError) return { error: error.userMessage };
    return { error: "Einstellungen konnten nicht gespeichert werden." };
  }

  revalidatePath("/settings/general");
  revalidatePath("/pipeline");
  return { error: null };
}
