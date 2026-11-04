import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { STORED_NAME_PATTERN } from "./validation";

// Der Speicherpfad liegt zur Laufzeit außerhalb des Projekts (CRM_UPLOAD_DIR);
// die turbopackIgnore-Kommentare verhindern, dass Next das Projekt für Dateizugriffe tracet.
// Privater Dateispeicher außerhalb von public/ und des Git-Repos. In
// Produktion ist CRM_UPLOAD_DIR Pflicht (absoluter Pfad, z. B.
// /srv/rdevolution-crm-data/uploads); lokal gilt .data/uploads.
export class StorageNotConfiguredError extends Error {
  constructor() {
    super("CRM_UPLOAD_DIR ist nicht konfiguriert.");
  }
}

export function getUploadDir(): string {
  const configured = process.env.CRM_UPLOAD_DIR?.trim();
  if (configured) {
    if (!path.isAbsolute(configured)) throw new StorageNotConfiguredError();
    return path.resolve(configured);
  }
  if (process.env.NODE_ENV === "production") throw new StorageNotConfiguredError();
  return path.resolve(process.cwd(), ".data", "uploads");
}

// Pfad nur aus einem validierten, zufälligen Namen - nie aus Benutzereingaben.
export function resolveStoredPath(storedName: string): string {
  if (!STORED_NAME_PATTERN.test(storedName)) throw new Error("Ungültiger Dateiname.");
  const root = getUploadDir();
  const target = path.resolve(root, storedName);
  if (path.dirname(target) !== root) throw new Error("Ungültiger Dateipfad.");
  return target;
}

export async function saveStoredFile(storedName: string, data: Buffer): Promise<void> {
  const target = resolveStoredPath(storedName);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(target), { recursive: true, mode: 0o700 });
  // "wx": nie eine bestehende Datei überschreiben.
  await writeFile(/*turbopackIgnore: true*/ target, data, { flag: "wx", mode: 0o600 });
}

export function openStoredFile(storedName: string) {
  return createReadStream(/*turbopackIgnore: true*/ resolveStoredPath(storedName));
}

// Entfernt die Datei; "gibt es nicht mehr" ist kein Fehler.
export async function removeStoredFile(storedName: string): Promise<void> {
  try {
    await unlink(/*turbopackIgnore: true*/ resolveStoredPath(storedName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
