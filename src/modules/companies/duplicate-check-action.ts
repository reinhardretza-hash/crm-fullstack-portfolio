"use server";

import { requireUser } from "@/server/rbac";
import { checkCompanyDuplicates, type CompanyDuplicateMatch } from "./duplicate-detection";

// Dünner Server-Action-Wrapper, damit das Formular (Client-Komponente) die
// Duplikatprüfung ohne eigene API-Route aufrufen kann. Nur lesend, daher
// reicht requireUser() ohne weitere Rollenprüfung.
export async function checkCompanyDuplicatesAction(input: {
  name: string;
  website?: string;
  email?: string;
  city?: string;
  excludeId?: string;
}): Promise<CompanyDuplicateMatch[]> {
  await requireUser();
  if (!input.name.trim()) return [];
  return checkCompanyDuplicates(input);
}
