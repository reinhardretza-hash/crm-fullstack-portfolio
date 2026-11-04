import { prisma } from "@/lib/prisma";

// Für /settings/tags (siehe Vorgabe Punkt 14): zeigt jeden Tag mit Anzahl
// zugeordneter Companies/Contacts über `_count` statt separater Queries.
export async function listTagsForAdmin() {
  return prisma.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      normalizedName: true,
      createdAt: true,
      _count: { select: { companies: true, contacts: true } },
    },
  });
}
