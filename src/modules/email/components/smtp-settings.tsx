"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { testSmtpAction } from "../actions";
export function SmtpSettings({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm">SMTP: {configured ? "Konfiguriert" : "Nicht konfiguriert"}</p>
      <Button
        variant="secondary"
        disabled={pending || !configured}
        onClick={() =>
          start(async () => {
            try {
              const result = await testSmtpAction();
              setMessage(result.message);
            } catch {
              setMessage("Verbindungstest nicht möglich.");
            }
          })
        }
      >
        {pending ? "Verbindung wird geprüft…" : "SMTP-Verbindung testen"}
      </Button>
      <p className="text-xs text-muted">
        Zugangsdaten werden ausschließlich über die Serverumgebung konfiguriert.
      </p>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
