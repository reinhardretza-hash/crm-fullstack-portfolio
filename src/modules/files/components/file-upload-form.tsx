"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ALLOWED_EXTENSIONS_TEXT, FILE_ACCEPT_ATTRIBUTE, MAX_FILE_BYTES } from "../validation";

export function FileUploadForm({
  target,
}: {
  target: { companyId?: string; contactId?: string; dealId?: string };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = input.current?.files?.[0];
    if (!file) {
      setError("Bitte eine Datei auswählen.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Die Datei ist zu groß (maximal ${MAX_FILE_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    for (const [key, value] of Object.entries(target)) if (value) body.set(key, value);
    try {
      const response = await fetch("/api/files", { method: "POST", body });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Upload fehlgeschlagen.");
        return;
      }
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setError("Upload fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium text-black">
        Datei hochladen
        <input
          ref={input}
          type="file"
          accept={FILE_ACCEPT_ATTRIBUTE}
          className="w-full text-sm file:mr-3 file:rounded-md file:border file:border-control-border file:bg-white file:px-3 file:py-1.5 file:text-sm"
        />
      </label>
      <p className="text-xs text-muted">
        Erlaubt: {ALLOWED_EXTENSIONS_TEXT} · max. {MAX_FILE_BYTES / 1024 / 1024} MB
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Wird hochgeladen …" : "Hochladen"}
        </Button>
      </div>
    </form>
  );
}
