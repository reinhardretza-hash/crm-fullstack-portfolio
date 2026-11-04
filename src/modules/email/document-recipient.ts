export function documentRecipientError(
  kind: "Angebot" | "Rechnung",
  document: {
    company: { deletedAt: Date | null };
    contact: { deletedAt: Date | null; email: string | null } | null;
    deal: { deletedAt: Date | null } | null;
  },
): string | null {
  if (document.company.deletedAt || document.contact?.deletedAt || document.deal?.deletedAt)
    return "Der verknüpfte CRM-Kontext ist gelöscht. Ein neuer Versand ist nicht möglich.";
  if (!document.contact?.email?.trim())
    return `Für ${kind === "Angebot" ? "dieses Angebot" : "diese Rechnung"} ist keine Empfänger-E-Mail hinterlegt.`;
  return null;
}
