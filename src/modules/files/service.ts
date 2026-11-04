import type { User } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { writeCrmAuditLog } from "@/modules/audit/log";
import { removeStoredFile, saveStoredFile } from "./storage";
import {
  canDeleteFile,
  fileTargetSchema,
  MAX_FILE_BYTES,
  newStoredName,
  validateUpload,
  type FileTarget,
} from "./validation";

export type UploadResult =
  { ok: true; id: string } | { ok: false; error: string; status: 400 | 404 | 413 | 500 };

async function targetExists(target: FileTarget): Promise<boolean> {
  if (target.companyId)
    return !!(await prisma.company.findFirst({
      where: { id: target.companyId, deletedAt: null },
      select: { id: true },
    }));
  if (target.contactId)
    return !!(await prisma.contact.findFirst({
      where: { id: target.contactId, deletedAt: null },
      select: { id: true },
    }));
  return !!(await prisma.deal.findFirst({
    where: { id: target.dealId, deletedAt: null },
    select: { id: true },
  }));
}

const auditTarget = (target: FileTarget) =>
  target.companyId
    ? ({ entityType: "Company", entityId: target.companyId } as const)
    : target.contactId
      ? ({ entityType: "Contact", entityId: target.contactId } as const)
      : ({ entityType: "Deal", entityId: target.dealId! } as const);

// Upload: Ziel prüfen -> Datei validieren -> auf Platte schreiben -> Metadaten
// speichern. Schlägt der DB-Schritt fehl, wird die Datei wieder entfernt
// (keine verwaisten Dateien).
export async function uploadFile(
  userId: string,
  input: { file: File; target: unknown },
): Promise<UploadResult> {
  const parsedTarget = fileTargetSchema.safeParse(input.target);
  if (!parsedTarget.success) {
    return {
      ok: false,
      error: parsedTarget.error.issues[0]?.message ?? "Ungültiges Ziel.",
      status: 400,
    };
  }
  const target = parsedTarget.data;
  if (input.file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `Die Datei ist zu groß (maximal ${MAX_FILE_BYTES / 1024 / 1024} MB).`,
      status: 413,
    };
  }
  if (!(await targetExists(target))) {
    return { ok: false, error: "Das Ziel wurde nicht gefunden oder ist gelöscht.", status: 404 };
  }

  const data = Buffer.from(await input.file.arrayBuffer());
  const check = validateUpload({
    name: input.file.name,
    declaredType: input.file.type,
    size: data.length,
    head: data.subarray(0, 16),
  });
  if (!check.ok) {
    return { ok: false, error: check.error, status: data.length > MAX_FILE_BYTES ? 413 : 400 };
  }

  const storedName = newStoredName(check.ext);
  try {
    await saveStoredFile(storedName, data);
  } catch {
    return { ok: false, error: "Die Datei konnte nicht gespeichert werden.", status: 500 };
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      const file = await tx.fileAttachment.create({
        data: {
          originalName: check.displayName,
          storedName,
          mimeType: check.mime,
          sizeBytes: data.length,
          uploadedByUserId: userId,
          ...target,
        },
        select: { id: true },
      });
      // Audit nur mit Metadaten, nie mit Dateiinhalt.
      await writeCrmAuditLog(tx, {
        action: "FILE_UPLOADED",
        userId,
        ...auditTarget(target),
        metadata: {
          fileId: file.id,
          name: check.displayName,
          sizeBytes: data.length,
          mimeType: check.mime,
        },
      });
      return file;
    });
    return { ok: true, id: created.id };
  } catch {
    await removeStoredFile(storedName).catch(() => undefined);
    return { ok: false, error: "Die Datei konnte nicht gespeichert werden.", status: 500 };
  }
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

// Löschen: Metadaten soft-deleten (Nachvollziehbarkeit), Datei physisch
// entfernen (Inhalt ist danach weg, keine verwaisten Dateien). Scheitert nur
// das Entfernen, bleibt die Datei als nicht erreichbare Leiche liegen; sie ist
// über deleted_at IS NOT NULL auffindbar (siehe docs/phase-15-customer-file.md).
export async function deleteFile(
  user: Pick<User, "id" | "role">,
  fileId: string,
): Promise<DeleteResult> {
  const file = await prisma.fileAttachment.findFirst({ where: { id: fileId, deletedAt: null } });
  if (!file || !canDeleteFile(user, file)) {
    // Gleiche Antwort für "gibt es nicht" und "nicht berechtigt".
    return { ok: false, error: "Datei nicht gefunden." };
  }
  const target = {
    companyId: file.companyId ?? undefined,
    contactId: file.contactId ?? undefined,
    dealId: file.dealId ?? undefined,
  };
  const changed = await prisma.$transaction(async (tx) => {
    const result = await tx.fileAttachment.updateMany({
      where: { id: file.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) return false;
    await writeCrmAuditLog(tx, {
      action: "FILE_DELETED",
      userId: user.id,
      ...auditTarget(target),
      metadata: { fileId: file.id, name: file.originalName, sizeBytes: file.sizeBytes },
    });
    return true;
  });
  if (!changed) return { ok: false, error: "Datei nicht gefunden." };
  await removeStoredFile(file.storedName).catch(() => undefined);
  return { ok: true };
}

// Download: nur nicht gelöschte Dateien, deren Ziel ebenfalls aktiv ist.
export async function getFileForDownload(fileId: string) {
  return prisma.fileAttachment.findFirst({
    where: {
      id: fileId,
      deletedAt: null,
      OR: [
        { companyId: { not: null }, company: { deletedAt: null } },
        { contactId: { not: null }, contact: { deletedAt: null } },
        { dealId: { not: null }, deal: { deletedAt: null } },
      ],
    },
    select: { id: true, originalName: true, storedName: true, mimeType: true, sizeBytes: true },
  });
}

export async function listFilesForTarget(target: FileTarget, take = 5) {
  const [files, total] = await Promise.all([
    prisma.fileAttachment.findMany({
      where: { ...target, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        uploadedByUserId: true,
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.fileAttachment.count({ where: { ...target, deletedAt: null } }),
  ]);
  return { files, total };
}
