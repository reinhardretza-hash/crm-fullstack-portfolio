"use client";

import { AppError } from "@/lib/errors";

// AppError.userMessage ist bewusst sicher für die Anzeige - alle anderen
// Fehler (Prisma, unerwartete Exceptions) zeigen nur eine generische Meldung,
// nie den rohen Fehler/Stacktrace.
export default function ErrorBoundary({ error }: { error: Error & { digest?: string } }) {
  const message =
    error instanceof AppError ? error.userMessage : "Es ist ein unerwarteter Fehler aufgetreten.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <p className="text-sm text-white">{message}</p>
    </div>
  );
}
