"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/rbac";
import { deleteFile } from "./service";

export type DeleteFileState = { error: string | null };

// Löschen mit serverseitiger Berechtigungsprüfung (Hochladender oder OWNER/ADMIN).
export async function deleteFileAction(fileId: string): Promise<DeleteFileState> {
  const user = await requireUser();
  const result = await deleteFile(user, fileId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/companies/[id]", "page");
  revalidatePath("/contacts/[id]", "page");
  revalidatePath("/deals/[id]", "page");
  return { error: null };
}
