import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/rbac";
import { getFileForDownload } from "@/modules/files/service";
import { openStoredFile } from "@/modules/files/storage";
import { contentDisposition } from "@/modules/files/validation";

type Context = { params: Promise<{ id: string }> };

// Download nur für angemeldete, aktive Benutzer; immer als Anhang, nie inline.
export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Nicht angemeldet.", { status: 401 });

  const { id } = await params;
  const file = await getFileForDownload(id);
  if (!file) return new NextResponse("Datei nicht gefunden.", { status: 404 });

  let stream;
  try {
    stream = openStoredFile(file.storedName);
  } catch {
    return new NextResponse("Datei nicht gefunden.", { status: 404 });
  }
  // Fehlt die Datei auf der Platte, endet der Stream mit Fehler -> 404 vorab prüfen.
  const body = await new Promise<ReadableStream | null>((resolve) => {
    stream.once("open", () => resolve(Readable.toWeb(stream) as ReadableStream));
    stream.once("error", () => resolve(null));
  });
  if (!body) return new NextResponse("Datei nicht gefunden.", { status: 404 });

  return new NextResponse(body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.sizeBytes),
      "Content-Disposition": contentDisposition(file.originalName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
