import { z } from "zod";
export const entityIdSchema = z.string().trim().min(1).max(100);
