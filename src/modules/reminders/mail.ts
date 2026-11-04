import { formatCentsAsEuro } from "@/lib/money";
import { PRIORITY_LABELS } from "@/lib/crm-labels";
import { dateKeyInTimeZone } from "@/lib/timezone";
import { PATH_BY_TYPE, type ReminderMailData } from "./rules";

// Interne Erinnerungs-Mail an den Mitarbeiter. Enthält bewusst KEINE
// Kunden-Adressen und wird nur an User.email adressiert (siehe service.ts).
const DATE = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" });
const DATE_UTC = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", dateStyle: "medium" });

const oneLine = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, 200);

export function pluralDays(days: number): string {
  return `${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

export function reminderUrl(baseUrl: string, data: ReminderMailData): string {
  return `${baseUrl.replace(/\/+$/, "")}${PATH_BY_TYPE[data.type]}/${data.id}`;
}

export function buildReminderMail(
  data: ReminderMailData,
  recipient: { firstName: string },
  baseUrl: string,
  now: Date = new Date(),
): { subject: string; text: string } {
  const greeting = `Hallo ${oneLine(recipient.firstName)},`;
  const link = reminderUrl(baseUrl, data);
  const footer = "RDEvolution CRM";
  const body = (lines: string[], linkLabel: string) =>
    [greeting, "", ...lines, "", `${linkLabel}: ${link}`, "", footer].join("\n");

  switch (data.type) {
    case "QUOTE_OPEN":
      return {
        subject: `CRM-Erinnerung: Angebot ${oneLine(data.quoteNumber)} noch offen`,
        text: body(
          [
            `das Angebot ${oneLine(data.quoteNumber)} ist seit ${pluralDays(data.days)} offen.`,
            "",
            `Kunde: ${oneLine(data.companyName)}`,
            `Status: ${data.statusLabel}`,
            `Versendet am: ${DATE.format(data.sentAt)}`,
            "",
            "Bitte prüfe den nächsten Schritt im CRM.",
          ],
          "Angebot öffnen",
        ),
      };
    case "DEAL_INACTIVE":
      return {
        subject: `CRM-Erinnerung: Deal seit ${pluralDays(data.days)} ohne Aktivität`,
        text: body(
          [
            `beim Deal "${oneLine(data.name)}" gab es seit ${pluralDays(data.days)} keine Aktivität.`,
            "",
            `Kunde: ${oneLine(data.companyName)}`,
            `Status: ${data.statusLabel}`,
            `Letzte Aktivität: ${DATE.format(data.lastActivityAt)}`,
            "",
            "Bitte prüfe den nächsten Schritt.",
          ],
          "Deal öffnen",
        ),
      };
    case "FOLLOW_UP_DUE": {
      const today = dateKeyInTimeZone(data.dueAt) >= dateKeyInTimeZone(now);
      return {
        subject: `CRM-Erinnerung: Follow-up ${today ? "heute fällig" : "überfällig"}`,
        text: body(
          [
            `für folgenden Lead ist ${today ? "heute" : "seit dem " + DATE.format(data.dueAt)} ein Follow-up fällig:`,
            "",
            `Lead: ${oneLine(data.title)}`,
            `Unternehmen: ${oneLine(data.companyName)}`,
            `Fällig: ${DATE.format(data.dueAt)}`,
          ],
          "Lead öffnen",
        ),
      };
    }
    case "TASK_OVERDUE":
      return {
        subject: "CRM-Erinnerung: Aufgabe überfällig",
        text: body(
          [
            "folgende Aufgabe ist überfällig:",
            "",
            `Aufgabe: ${oneLine(data.title)}`,
            `Fällig seit: ${DATE.format(data.dueAt)}`,
            `Priorität: ${PRIORITY_LABELS[data.priority]}`,
          ],
          "Aufgabe öffnen",
        ),
      };
    case "INVOICE_OVERDUE":
      return {
        subject: `CRM-Erinnerung: Rechnung ${oneLine(data.invoiceNumber)} überfällig`,
        text: body(
          [
            `die Rechnung ${oneLine(data.invoiceNumber)} ist überfällig.`,
            "",
            `Kunde: ${oneLine(data.companyName)}`,
            `Betrag: ${formatCentsAsEuro(data.totalCents)}`,
            `Fällig seit: ${DATE_UTC.format(data.dueDate)}`,
            "",
            "Bitte prüfe den Vorgang.",
          ],
          "Rechnung öffnen",
        ),
      };
  }
}
