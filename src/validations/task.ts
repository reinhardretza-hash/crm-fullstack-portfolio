import { z } from "zod";
import { combineDateAndOptionalTime } from "@/lib/timezone";
import { prioritySchema, taskStatusSchema } from "./crm-enums";

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined));

const optionalTimeOnly = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || /^\d{2}:\d{2}$/.test(value), {
    message: "Bitte eine gültige Uhrzeit (HH:mm) angeben.",
  });

const requiredDateOnly = z
  .string()
  .trim()
  .min(1, "Fälligkeitsdatum ist erforderlich.")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Bitte ein gültiges Datum angeben.",
  });

const optionalDateOnly = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : undefined))
  .refine((value) => value === undefined || !Number.isNaN(Date.parse(value)), {
    message: "Bitte ein gültiges Datum angeben.",
  });

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Titel ist erforderlich.").max(200),
    description: optionalTrimmedString,
    assignedUserId: z.string().trim().min(1, "Verantwortlicher ist erforderlich."),
    status: taskStatusSchema.default("OPEN"),
    priority: prioritySchema.default("NORMAL"),
    dueDate: requiredDateOnly,
    dueTime: optionalTimeOnly,
    reminderDate: optionalDateOnly,
    reminderTime: optionalTimeOnly,
    companyId: optionalTrimmedString,
    contactId: optionalTrimmedString,
    leadId: optionalTrimmedString,
    dealId: optionalTrimmedString,
  })
  // Höchstens EIN CRM-Ziel - 0 ist zulässig (rein interne Aufgabe). Siehe
  // auch die serverseitige Prüfung in src/modules/tasks/validation.ts
  // (dort nochmals zentral geprüft, da dieses Zod-Refine nur das
  // Formular, nicht z. B. eine zukünftige API, abdeckt) und die
  // PostgreSQL-CHECK-Constraint.
  .refine(
    (data) =>
      [data.companyId, data.contactId, data.leadId, data.dealId].filter(Boolean).length <= 1,
    {
      message:
        "Eine Aufgabe darf höchstens einem Unternehmen, Kontakt, Lead oder Deal zugeordnet sein.",
      path: ["companyId"],
    },
  )
  .transform((data) => {
    const dueAt = combineDateAndOptionalTime(data.dueDate, data.dueTime);
    const reminderAt = data.reminderDate
      ? combineDateAndOptionalTime(data.reminderDate, data.reminderTime)
      : undefined;
    return { ...data, dueAt, reminderAt };
  })
  // reminderAt darf fachlich nicht nach dueAt liegen (siehe Vorgabe Punkt
  // 31) - zusätzlich zur PostgreSQL-CHECK-Constraint auch hier geprüft,
  // damit der Benutzer eine verständliche Fehlermeldung im Formular sieht,
  // statt eines rohen DB-Fehlers.
  .refine(
    (data) => data.reminderAt === undefined || data.reminderAt.getTime() <= data.dueAt.getTime(),
    {
      message: "Die Erinnerung darf nicht nach der Fälligkeit liegen.",
      path: ["reminderDate"],
    },
  );

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const TASK_VIEW_VALUES = ["all", "open", "today", "overdue", "upcoming", "done"] as const;
export type TaskView = (typeof TASK_VIEW_VALUES)[number];

export const taskFiltersSchema = z.object({
  q: z.string().trim().optional(),
  status: taskStatusSchema.optional(),
  priority: prioritySchema.optional(),
  assignedUserId: z.string().trim().optional(),
  // Schnelle Ansichten (siehe Vorgabe Punkt 14) - eine zentrale
  // Klassifikation statt getrennter Seiten, siehe
  // src/modules/tasks/due.ts.
  view: z.enum(TASK_VIEW_VALUES).default("open"),
  sort: z.enum(["title", "priority", "dueAt", "updatedAt"]).default("dueAt"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export type TaskFilters = z.infer<typeof taskFiltersSchema>;

export const taskStatusChangeSchema = z.object({
  taskId: z.string().trim().min(1),
  expectedVersion: z.coerce.number().int().min(1),
});
