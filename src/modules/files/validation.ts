import { z } from "zod";
import type { User } from "@/generated/prisma/client";

// Datei-Uploads: serverseitige Validierung (reine Funktionen, ohne I/O).
// Größenlimit 10 MB: deckt typische Angebots-PDFs, Verträge und Fotos ab,
// bleibt aber klein genug für Speicher/Backup und die Verarbeitung im Request
// (die Datei wird einmal komplett im Speicher geprüft). Mehr nur bewusst.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

type FileKind = {
  ext: string;
  mime: string;
  label: string;
  // Magic-Bytes-Prüfung gegen umbenannte/falsche Inhalte.
  matches: (head: Uint8Array) => boolean;
};

const startsWith = (head: Uint8Array, bytes: number[]) =>
  bytes.every((byte, index) => head[index] === byte);
const isZip = (head: Uint8Array) => startsWith(head, [0x50, 0x4b, 0x03, 0x04]);

// Bewusst nur typische Büro-/Bildformate. Kein SVG/HTML/Skript, kein ZIP/EXE.
export const FILE_KINDS: FileKind[] = [
  {
    ext: "pdf",
    mime: "application/pdf",
    label: "PDF",
    matches: (h) => startsWith(h, [0x25, 0x50, 0x44, 0x46]),
  },
  {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    label: "Word",
    matches: isZip,
  },
  {
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "Excel",
    matches: isZip,
  },
  {
    ext: "png",
    mime: "image/png",
    label: "PNG",
    matches: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47]),
  },
  {
    ext: "jpg",
    mime: "image/jpeg",
    label: "JPG",
    matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  },
  {
    ext: "jpeg",
    mime: "image/jpeg",
    label: "JPG",
    matches: (h) => startsWith(h, [0xff, 0xd8, 0xff]),
  },
  { ext: "txt", mime: "text/plain", label: "Text", matches: (h) => !h.includes(0) },
];

export const ALLOWED_EXTENSIONS_TEXT = "PDF, DOCX, XLSX, PNG, JPG, TXT";
export const FILE_ACCEPT_ATTRIBUTE = FILE_KINDS.map((kind) => `.${kind.ext}`).join(",");

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index + 1).toLowerCase() : "";
}

// Anzeigename: nur das Metadatum. Pfadanteile, Steuerzeichen und
// Anführungszeichen entfernen, Länge begrenzen (Erweiterung bleibt).
export function safeDisplayName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Nur eine Endung (".pdf"): Platzhalter-Name statt versteckter Datei.
  const onlyExtension = /^\.+([a-z0-9]{1,8})$/i.exec(base);
  if (onlyExtension) return `Datei.${onlyExtension[1].toLowerCase()}`;
  const ext = fileExtension(base);
  const stem = ext ? base.slice(0, base.length - ext.length - 1) : base;
  const limited = stem.slice(0, 120).trim() || "Datei";
  return ext ? `${limited}.${ext}` : limited;
}

export type UploadCheck =
  { ok: true; ext: string; mime: string; displayName: string } | { ok: false; error: string };

export function validateUpload(input: {
  name: string;
  declaredType: string;
  size: number;
  head: Uint8Array;
}): UploadCheck {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "Die Datei ist leer." };
  }
  if (input.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `Die Datei ist zu groß (maximal ${MAX_FILE_BYTES / 1024 / 1024} MB).`,
    };
  }
  const ext = fileExtension(input.name);
  const kind = FILE_KINDS.find((candidate) => candidate.ext === ext);
  if (!kind) {
    return { ok: false, error: `Dateityp nicht erlaubt. Erlaubt: ${ALLOWED_EXTENSIONS_TEXT}.` };
  }
  // Ein deklarierter MIME-Typ muss zur Endung passen; ein fehlender wird
  // über die Inhaltsprüfung abgesichert.
  const declared = input.declaredType.trim().toLowerCase().split(";")[0];
  if (declared && declared !== kind.mime) {
    return { ok: false, error: "Dateityp und Dateiendung passen nicht zusammen." };
  }
  if (!kind.matches(input.head)) {
    return { ok: false, error: "Der Dateiinhalt passt nicht zum Dateityp." };
  }
  return { ok: true, ext: kind.ext, mime: kind.mime, displayName: safeDisplayName(input.name) };
}

// Zufälliger interner Name; der Originalname wird nie für den Pfad benutzt.
export function newStoredName(ext: string): string {
  return `${globalThis.crypto.randomUUID()}.${ext}`;
}
export const STORED_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/;

// Download-Header: immer als Anhang (nie inline ausführbar), UTF-8-Dateiname.
export function contentDisposition(displayName: string): string {
  const ascii = displayName.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(displayName)}`;
}

// Genau ein Ziel (Unternehmen, Kontakt oder Deal).
export const fileTargetSchema = z
  .object({
    companyId: z.string().trim().min(1).optional(),
    contactId: z.string().trim().min(1).optional(),
    dealId: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => [value.companyId, value.contactId, value.dealId].filter(Boolean).length === 1,
    { message: "Eine Datei muss genau einem Unternehmen, Kontakt oder Deal zugeordnet sein." },
  );
export type FileTarget = z.infer<typeof fileTargetSchema>;

// Löschen: Hochladender oder OWNER/ADMIN. Hochladen/Herunterladen: jeder
// angemeldete, aktive Benutzer (das CRM kennt kein Ownership-Scoping).
export function canDeleteFile(
  user: Pick<User, "id" | "role">,
  file: { uploadedByUserId: string },
): boolean {
  return user.role === "OWNER" || user.role === "ADMIN" || file.uploadedByUserId === user.id;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
