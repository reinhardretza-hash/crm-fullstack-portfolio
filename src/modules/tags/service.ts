import { Prisma } from "@/generated/prisma/client";
import { normalizeTagName } from "@/lib/normalize";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

// Läuft innerhalb der aufrufenden Transaktion (Company-/Contact-Erstellung),
// damit nie ein halbfertiger Zustand entsteht (Tag existiert, aber die
// Zuordnung schlägt fehl, oder umgekehrt). Legt fehlende Tags an, findet
// vorhandene über normalizedName wieder (case-/whitespace-insensitiv).
//
// `upsert()` ist unter echter PostgreSQL-Nebenläufigkeit NICHT race-sicher
// für einen brandneuen Tag-Namen: Zwei parallele Transaktionen können beide
// "existiert nicht" sehen (READ COMMITTED, keine der beiden hat noch
// committet) und beide versuchen zu INSERTen - eine schlägt dann mit einer
// echten Unique-Constraint-Verletzung fehl, statt (wie man es von "upsert"
// erwarten würde) einfach die bereits existierende Zeile zurückzugeben. Ein
// echter Integrationstest mit mehreren parallelen Transaktionen hat das
// aufgedeckt (Schritt 4).
//
// Der Fix braucht einen SAVEPOINT: Sobald IRGENDEIN Statement in einer
// PostgreSQL-Transaktion fehlschlägt, markiert Postgres die GESAMTE
// Transaktion als abgebrochen - jeder weitere Befehl (auch ein simples
// SELECT zum Nachlesen) schlägt dann mit "current transaction is aborted"
// fehl, bis zu einem ROLLBACK. Ohne SAVEPOINT würde das bloße Abfangen des
// P2002-Fehlers und Nachlesen daher selbst wieder fehlschlagen (so zunächst
// in diesem Integrationstest geschehen). Der SAVEPOINT erlaubt, nur den
// fehlgeschlagenen Upsert-Versuch zurückzurollen, ohne die umgebende
// Transaktion (Company-/Contact-Erstellung) zu beeinträchtigen.
async function findOrCreateTag(
  tx: Prisma.TransactionClient,
  name: string,
  normalizedName: string,
): Promise<{ id: string }> {
  await tx.$executeRawUnsafe(`SAVEPOINT tag_upsert`);
  try {
    const tag = await tx.tag.upsert({
      where: { normalizedName },
      update: {},
      create: { name, normalizedName },
    });
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT tag_upsert`);
    return tag;
  } catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT tag_upsert`);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return tx.tag.findUniqueOrThrow({ where: { normalizedName } });
    }
    throw error;
  }
}

export async function resolveTagIds(
  tx: Prisma.TransactionClient,
  tagNames: string[],
): Promise<string[]> {
  const uniqueNormalized = [...new Set(tagNames.map(normalizeTagName).filter(Boolean))];

  const tagIds: string[] = [];
  for (const normalizedName of uniqueNormalized) {
    const originalName =
      tagNames.find((name) => normalizeTagName(name) === normalizedName) ?? normalizedName;

    const tag = await findOrCreateTag(tx, originalName.trim(), normalizedName);
    tagIds.push(tag.id);
  }

  return tagIds;
}
