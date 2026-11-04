import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/rbac";
import { uploadFile } from "@/modules/files/service";
import { StorageNotConfiguredError } from "@/modules/files/storage";
import { MAX_FILE_BYTES } from "@/modules/files/validation";

// Upload (multipart/form-data: file + genau eines von companyId/contactId/dealId).
// Nur angemeldete, aktive Benutzer. Die Datei wird serverseitig validiert.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  // Grober Vorab-Check, bevor der Body gelesen wird (Multipart-Overhead < 1 MB).
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_FILE_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: "Die Datei ist zu groß." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Bitte eine Datei auswählen." }, { status: 400 });
  }
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value ? value : undefined;
  };

  try {
    const result = await uploadFile(user.id, {
      file,
      target: {
        companyId: text("companyId"),
        contactId: text("contactId"),
        dealId: text("dealId"),
      },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return NextResponse.json(
        { error: "Datei-Upload ist auf diesem Server nicht eingerichtet." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Upload fehlgeschlagen." }, { status: 500 });
  }
}
