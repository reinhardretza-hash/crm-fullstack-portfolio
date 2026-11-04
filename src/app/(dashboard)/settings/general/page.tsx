import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/rbac";
import { requirePagePermission } from "@/server/page-permissions";
import { getSystemSettings } from "@/modules/settings/queries";
import { getDefaultPipeline, listPipelineOptions } from "@/modules/leads/queries";
import { SettingsForm } from "@/modules/settings/components/settings-form";
import { SmtpSettings } from "@/modules/email/components/smtp-settings";
import { isSmtpConfigured } from "@/modules/email/smtp";

export const metadata: Metadata = {
  title: "Allgemeine Einstellungen – RDEvolution CRM",
};

export default async function GeneralSettingsPage() {
  const user = await requireUser();
  requirePagePermission(user, "SETTINGS_MANAGE");

  const [settings, pipelines, defaultPipeline] = await Promise.all([
    getSystemSettings(),
    listPipelineOptions(),
    getDefaultPipeline(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Allgemeine Einstellungen</h2>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>CRM-Grundeinstellungen</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            pipelines={pipelines}
            defaultValues={{
              legalCompanyName: settings.legalCompanyName,
              street: settings.street,
              postalCode: settings.postalCode,
              city: settings.city,
              country: settings.country,
              vatId: settings.vatId,
              taxNumber: settings.taxNumber,
              iban: settings.iban,
              bic: settings.bic,
              bankName: settings.bankName,
              defaultPaymentTermDays: settings.defaultPaymentTermDays,
              companyName: settings.companyName,
              timezone: settings.timezone,
              currency: settings.currency,
              defaultPipelineId: defaultPipeline?.id ?? pipelines[0]?.id ?? "",
              version: settings.version,
            }}
          />
        </CardContent>
      </Card>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>E-Mail-Versand</CardTitle>
        </CardHeader>
        <CardContent>
          <SmtpSettings configured={isSmtpConfigured()} />
        </CardContent>
      </Card>
    </div>
  );
}
