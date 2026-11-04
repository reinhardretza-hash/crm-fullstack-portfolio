import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { ReminderSettingsForm } from "@/modules/reminders/components/reminder-settings-form";
import { ensureReminderSettings } from "@/modules/reminders/settings";

export const metadata: Metadata = {
  title: "Automatische Erinnerungen – RDEvolution CRM",
};

export default async function ReminderSettingsPage() {
  const user = await requireUser();
  requirePagePermission(user, "SETTINGS_MANAGE");
  const settings = await ensureReminderSettings();

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Automatische Erinnerungen</h2>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Interne Erinnerungen per E-Mail</CardTitle>
          <p className="text-xs text-muted">
            Zuständige Mitarbeiter werden einmal pro Vorgang an ihre Account-E-Mail erinnert. Kunden
            erhalten nie automatisch E-Mails. Standardmäßig ist alles ausgeschaltet.
          </p>
        </CardHeader>
        <CardContent>
          <ReminderSettingsForm
            values={{
              quoteEnabled: settings.quoteEnabled,
              quoteDays: settings.quoteDays,
              dealEnabled: settings.dealEnabled,
              dealDays: settings.dealDays,
              followUpEnabled: settings.followUpEnabled,
              taskEnabled: settings.taskEnabled,
              invoiceEnabled: settings.invoiceEnabled,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
