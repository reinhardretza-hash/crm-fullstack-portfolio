import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { resolveTagIds } from "@/modules/tags/service";

// Zwei (nahezu) gleichzeitige Operationen, die denselben neuen, normalisierten
// Tag "handwerk" anlegen wollen - jede in ihrer eigenen Transaktion, so wie
// es bei zwei parallelen Company-/Contact-Erstellungen tatsächlich passieren
// könnte. Erwartung: am Ende existiert genau EIN Tag mit normalizedName
// "handwerk", kein unhandled Unique-Constraint-Fehler, kein halbfertiger
// Zustand.
describe("Concurrent tag creation for the same normalized name (real PostgreSQL)", () => {
  it("results in exactly one tag, no unhandled unique constraint error", async () => {
    const attempts = Array.from({ length: 8 }, (_, i) =>
      prisma.$transaction((tx) => resolveTagIds(tx, [i % 2 === 0 ? "Handwerk" : "HANDWERK"])),
    );

    const results = await Promise.allSettled(attempts);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);

    const tags = await prisma.tag.findMany({ where: { normalizedName: "handwerk" } });
    expect(tags).toHaveLength(1);

    const resolvedIds = results
      .filter((r): r is PromiseFulfilledResult<string[]> => r.status === "fulfilled")
      .map((r) => r.value[0]);
    expect(new Set(resolvedIds).size).toBe(1);
    expect(resolvedIds[0]).toBe(tags[0].id);
  });

  it("leaves no half-finished company record if tag resolution races with company creation", async () => {
    const { createId } = await import("@paralleldrive/cuid2");

    async function createCompanyWithTag() {
      return prisma.$transaction(async (tx) => {
        const [tagId] = await resolveTagIds(tx, ["Concurrency-Tag"]);
        return tx.company.create({
          data: { id: createId(), name: `Company-${createId()}`, tags: { create: [{ tagId }] } },
        });
      });
    }

    const companies = await Promise.all(Array.from({ length: 5 }, () => createCompanyWithTag()));

    const tags = await prisma.tag.findMany({ where: { normalizedName: "concurrency-tag" } });
    expect(tags).toHaveLength(1);

    for (const company of companies) {
      const companyTags = await prisma.companyTag.findMany({ where: { companyId: company.id } });
      expect(companyTags).toHaveLength(1);
      expect(companyTags[0].tagId).toBe(tags[0].id);
    }
  });
});
