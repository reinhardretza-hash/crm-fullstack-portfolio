import { Prisma } from "@/generated/prisma/client";

// P2002: Unique-Constraint-Verstoß. Zentral hier statt an jeder
// Aufrufstelle einzeln geprüft, damit Server Actions eine verständliche
// Meldung zeigen können, statt den rohen Prisma-Fehler durchzureichen.
export function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
