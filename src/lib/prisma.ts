import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

// Prisma 7 liest die Connection-URL nicht mehr aus dem Schema, sondern
// erfordert einen expliziten Driver-Adapter für die Laufzeitverbindung.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// Next.js lädt Module in Entwicklung mehrfach neu (Hot Reload). Ohne
// Singleton würde jedes Mal ein neuer PrismaClient mit eigenem
// Connection-Pool entstehen und die Datenbankverbindungen erschöpfen.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // Raw driver errors may contain SQL parameters or connection details.
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
