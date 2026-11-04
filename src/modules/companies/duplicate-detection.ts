import { prisma } from "@/lib/prisma";
import { extractDomain, normalizeEmail } from "@/lib/normalize";

export type CompanyDuplicateMatch = {
  id: string;
  name: string;
  city: string | null;
  matchType: "website" | "email" | "name_city";
};

type CheckCompanyDuplicatesInput = {
  name: string;
  website?: string;
  email?: string;
  city?: string;
  excludeId?: string;
};

// Warnt vor möglichen Duplikaten, blockiert aber NICHT automatisch (siehe
// Vorgabe) - es gibt keine harte DB-Unique-Constraint auf Name/E-Mail, nur
// eine Hinweis-Funktion für die UI vor dem Anlegen.
export async function checkCompanyDuplicates(
  input: CheckCompanyDuplicatesInput,
): Promise<CompanyDuplicateMatch[]> {
  const websiteDomain = input.website ? safeExtractDomain(input.website) : undefined;
  const emailNormalized = input.email ? normalizeEmail(input.email) : undefined;

  const matches = await prisma.company.findMany({
    where: {
      deletedAt: null,
      id: input.excludeId ? { not: input.excludeId } : undefined,
      OR: [
        websiteDomain ? { websiteDomain } : undefined,
        emailNormalized ? { emailNormalized } : undefined,
        input.city
          ? {
              name: { equals: input.name, mode: "insensitive" as const },
              city: { equals: input.city, mode: "insensitive" as const },
            }
          : undefined,
      ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause)),
    },
    select: { id: true, name: true, city: true, websiteDomain: true, emailNormalized: true },
    take: 5,
  });

  return matches.map((match) => ({
    id: match.id,
    name: match.name,
    city: match.city,
    matchType:
      websiteDomain && match.websiteDomain === websiteDomain
        ? "website"
        : emailNormalized && match.emailNormalized === emailNormalized
          ? "email"
          : "name_city",
  }));
}

function safeExtractDomain(website: string): string | undefined {
  try {
    return extractDomain(website);
  } catch {
    return undefined;
  }
}
