"use server";

import { requireUser } from "@/server/rbac";
import { checkContactDuplicates, type ContactDuplicateMatch } from "./duplicate-detection";

export async function checkContactDuplicatesAction(input: {
  firstName?: string;
  lastName?: string;
  email?: string;
  linkedinUrl?: string;
  phone?: string;
  companyId?: string;
  excludeId?: string;
}): Promise<ContactDuplicateMatch[]> {
  await requireUser();
  return checkContactDuplicates(input);
}
