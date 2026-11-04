import { notFound } from "next/navigation";
import type { User } from "@/generated/prisma/client";
import { hasPermission, type Permission } from "./permissions";

// Seiten sperren über den normalen 404-Kontrollfluss, ohne Fehler-Overlay.
// Mutationen behalten requirePermission und den typisierten ForbiddenError.
export function requirePagePermission(user: Pick<User, "role">, permission: Permission): void {
  if (!hasPermission(user, permission)) notFound();
}
