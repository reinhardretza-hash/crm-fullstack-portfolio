import { requireUser } from "@/server/rbac";
import { prisma } from "@/lib/prisma";
import { invoiceFormOptions } from "@/modules/invoices/queries";
import { InvoiceForm } from "@/modules/invoices/components/invoice-form";
import { getQuote } from "@/modules/quotes/queries";
import { quoteToInvoiceDefaults } from "@/modules/invoices/mapping";
import { duplicateInvoiceWarning } from "@/modules/invoices/helpers";
import { getSystemSettings } from "@/modules/settings/queries";
import { dateKeyInTimeZone, addCalendarDays } from "@/lib/timezone";
export const metadata = { title: "Rechnung erstellen – RDEvolution CRM" };
export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const params = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const [options, settings] = await Promise.all([invoiceFormOptions(), getSystemSettings()]);
  const quote = params.quoteId ? await getQuote(params.quoteId) : null;
  if (params.quoteId && (!quote || quote.status !== "ACCEPTED"))
    return <p role="alert">Nur angenommene Angebote können eine Rechnung erzeugen.</p>;
  const deal = options.deals.find((d) => d.id === (quote?.dealId || params.dealId));
  const contact = options.contacts.find(
    (c) => c.id === (quote?.contactId || deal?.contactId || params.contactId),
  );
  const companyId =
    quote?.companyId || deal?.companyId || contact?.companyId || params.companyId || "";
  if (
    (params.dealId && !deal) ||
    (params.contactId && !contact) ||
    (companyId && !options.companies.some((c) => c.id === companyId))
  )
    return <p role="alert">CRM-Kontext wurde nicht gefunden.</p>;
  const assignedUserId =
    [quote?.assignedUserId, deal?.assignedUserId, params.assignedUserId, user.id].find((id) =>
      options.users.some((u) => u.id === id),
    ) || user.id;
  const issueDate = dateKeyInTimeZone(new Date());
  const count = quote
    ? await prisma.invoice.count({
        where: { quoteId: quote.id, deletedAt: null, status: { not: "CANCELLED" } },
      })
    : 0;
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <h2 className="text-lg font-semibold">Rechnung erstellen</h2>
      {quote && (
        <p className="text-sm">
          Aus Angebot {quote.quoteNumber}. Eigene Rechnungspositionen werden erst beim Speichern
          angelegt.
        </p>
      )}
      <InvoiceForm
        quoteId={quote?.id}
        duplicateWarning={duplicateInvoiceWarning(count)}
        options={options}
        defaults={{
          ...(quote
            ? quoteToInvoiceDefaults(quote)
            : {
                companyId,
                contactId: contact?.id,
                dealId: deal?.id,
                introText: "Vielen Dank für Ihren Auftrag. Wir berechnen die folgenden Leistungen.",
                closingText:
                  "Bitte überweisen Sie den Gesamtbetrag bis zum angegebenen Fälligkeitsdatum.",
              }),
          assignedUserId,
          issueDate,
          dueDate: addCalendarDays(issueDate, settings.defaultPaymentTermDays),
        }}
      />
    </div>
  );
}
