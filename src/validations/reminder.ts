import { z } from "zod";

const flag = z.preprocess(
  (value) => value === "on" || value === "true" || value === true,
  z.boolean(),
);
const days = z.coerce
  .number({ error: "Bitte eine Zahl eingeben." })
  .int("Bitte eine ganze Zahl eingeben.")
  .min(1, "Mindestens 1 Tag.")
  .max(365, "Höchstens 365 Tage.");

export const reminderSettingsSchema = z.object({
  quoteEnabled: flag,
  quoteDays: days,
  dealEnabled: flag,
  dealDays: days,
  followUpEnabled: flag,
  taskEnabled: flag,
  invoiceEnabled: flag,
});
export type ReminderSettingsInput = z.infer<typeof reminderSettingsSchema>;
