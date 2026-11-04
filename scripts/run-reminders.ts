// Interner Erinnerungs-Job (einmaliger Lauf, keine Endlosschleife). Start über
// `npm run reminders:run` bzw. den systemd-Timer (docs/phase-14-reminders.md).
// Läuft mit `--conditions=react-server`, damit das bestehende SMTP-Modul
// ("server-only") außerhalb von Next.js importierbar ist.
// Exit-Codes: 0 = ok (auch "anderer Job läuft"), 1 = Fehler/Konfiguration,
// 2 = Lauf beendet, aber mindestens eine Mail ist fehlgeschlagen.
import { prisma } from "@/lib/prisma";
import { runReminders, type ReminderMailer } from "@/modules/reminders/service";

async function main(): Promise<number> {
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    console.error("[reminders] AUTH_URL/NEXTAUTH_URL fehlt (Link-Basis für Mails).");
    return 1;
  }
  const { getSmtpConfig, isSmtpConfigured, sendSmtpMail } = await import("@/modules/email/smtp");

  const smtpReady = isSmtpConfigured();
  const mailer: ReminderMailer = smtpReady
    ? {
        fromEmail: getSmtpConfig().fromEmail,
        send: (mail) =>
          sendSmtpMail({
            fromEmail: mail.fromEmail,
            fromName: mail.fromName,
            toEmail: mail.toEmail,
            toName: mail.toName,
            subject: mail.subject,
            textBody: mail.textBody,
          }),
      }
    : { fromEmail: "", send: async () => undefined };
  if (!smtpReady) {
    console.error(
      "[reminders] SMTP nicht konfiguriert: Reminder werden erfasst, aber nicht gesendet.",
    );
  }

  const summary = await runReminders({ mailer, baseUrl, batchLimit: smtpReady ? undefined : 0 });
  console.log(`[reminders] ${JSON.stringify(summary)}`);
  if (!smtpReady) return 1;
  return summary.failed > 0 ? 2 : 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error("[reminders] Abbruch:", error instanceof Error ? error.message : "unbekannt");
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
