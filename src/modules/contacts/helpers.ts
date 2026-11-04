// Kein persistiertes fullName-Feld - der Anzeigename wird immer aus
// firstName/lastName abgeleitet (siehe Vorgabe: keine redundante Speicherung).
export function contactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "(Ohne Namen)";
}
