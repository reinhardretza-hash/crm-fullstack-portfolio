import { z } from "zod";

export const createTagFormSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(60),
});

export const renameTagFormSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich.").max(60),
});
