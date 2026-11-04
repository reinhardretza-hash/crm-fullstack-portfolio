import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeLinkedinUrl, normalizePhone } from "@/lib/normalize";

export type ContactDuplicateMatch = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  matchType: "email" | "linkedin" | "phone" | "name_company";
};

type CheckContactDuplicatesInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinUrl?: string;
  phone?: string;
  companyId?: string;
  excludeId?: string;
};

// Warnt vor möglichen Duplikaten, blockiert aber NICHT automatisch.
export async function checkContactDuplicates(
  input: CheckContactDuplicatesInput,
): Promise<ContactDuplicateMatch[]> {
  const emailNormalized = input.email ? normalizeEmail(input.email) : undefined;
  const linkedinNormalized = input.linkedinUrl
    ? safeNormalizeLinkedin(input.linkedinUrl)
    : undefined;
  const phoneNormalized = input.phone ? normalizePhone(input.phone) : undefined;

  const nameCompanyClause =
    input.firstName && input.lastName && input.companyId
      ? {
          firstName: { equals: input.firstName, mode: "insensitive" as const },
          lastName: { equals: input.lastName, mode: "insensitive" as const },
          companyId: input.companyId,
        }
      : undefined;

  const matches = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      id: input.excludeId ? { not: input.excludeId } : undefined,
      OR: [
        emailNormalized ? { emailNormalized } : undefined,
        linkedinNormalized ? { linkedinNormalized } : undefined,
        phoneNormalized ? { phoneNormalized } : undefined,
        nameCompanyClause,
      ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause)),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emailNormalized: true,
      linkedinNormalized: true,
      phoneNormalized: true,
    },
    take: 5,
  });

  return matches.map((match) => ({
    id: match.id,
    firstName: match.firstName,
    lastName: match.lastName,
    matchType:
      emailNormalized && match.emailNormalized === emailNormalized
        ? "email"
        : linkedinNormalized && match.linkedinNormalized === linkedinNormalized
          ? "linkedin"
          : phoneNormalized && match.phoneNormalized === phoneNormalized
            ? "phone"
            : "name_company",
  }));
}

function safeNormalizeLinkedin(url: string): string | undefined {
  try {
    return normalizeLinkedinUrl(url);
  } catch {
    return undefined;
  }
}
