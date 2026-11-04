import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";

// Rollen-/Statusänderungen laufen mit einem gemeinsamen Transaktionslock.
export async function assertOwnerProtection(
  tx: Prisma.TransactionClient,
  target: { id: string; role: string; isActive: boolean },
  next: { role?: string; isActive?: boolean },
): Promise<void> {
  // COUNT + UPDATE unter READ COMMITTED allein verhindern keinen Write Skew.
  // Alle Rollen-/Statusänderungen serialisieren und den Zielzustand frisch lesen.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(620006)`;
  const current = await tx.user.findUnique({ where: { id: target.id } });
  if (!current) throw new AppError("Benutzer wurde nicht gefunden.");
  const wasActiveOwner = current.role === "OWNER" && current.isActive;
  const staysActiveOwner =
    (next.role ?? current.role) === "OWNER" && (next.isActive ?? current.isActive);

  // Nur relevant, wenn der Zielbenutzer VORHER ein aktiver OWNER war und es
  // NACHHER nicht mehr wäre - jede andere Änderung ist unkritisch.
  if (!wasActiveOwner || staysActiveOwner) {
    return;
  }

  const otherActiveOwners = await tx.user.count({
    where: { role: "OWNER", isActive: true, id: { not: target.id } },
  });

  if (otherActiveOwners === 0) {
    throw new AppError("Der letzte aktive OWNER kann nicht deaktiviert oder herabgestuft werden.");
  }
}
