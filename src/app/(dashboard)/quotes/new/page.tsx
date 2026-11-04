import { requireUser } from "@/server/rbac";
import { quoteFormOptions } from "@/modules/quotes/queries";
import { QuoteForm } from "@/modules/quotes/components/quote-form";
import { dateKeyInTimeZone, addCalendarDays } from "@/lib/timezone";
import { formatCentsAsEuro } from "@/lib/money";
export const metadata = { title: "Angebot erstellen – RDEvolution CRM" };
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser(),
    raw = await searchParams,
    options = await quoteFormOptions();
  const params = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const deal = options.deals.find((d) => d.id === params.dealId),
    contact = options.contacts.find((c) => c.id === (deal?.contactId || params.contactId));
  const companyId = deal?.companyId || contact?.companyId || params.companyId || "";
  if (
    (params.dealId && !deal) ||
    (params.contactId && !contact) ||
    (companyId && !options.companies.some((c) => c.id === companyId))
  )
    return <p role="alert">CRM-Kontext wurde nicht gefunden.</p>;
  const issueDate = dateKeyInTimeZone(new Date());
  const assignedUserId =
    [deal?.assignedUserId, params.assignedUserId, user.id].find((id) =>
      options.users.some((u) => u.id === id),
    ) || user.id;
  return (
    <div className="flex min-w-0 flex-col gap-5 text-black">
      <h2 className="text-lg font-semibold">Angebot erstellen</h2>
      {deal && (
        <p className="text-sm text-secondary">
          Aus Deal „{deal.name}“. Deal-Wert: {formatCentsAsEuro(deal.valueCents)} als Orientierung;
          das Angebot wird erst beim Speichern erstellt.
        </p>
      )}
      <QuoteForm
        options={options}
        defaults={{
          companyId,
          contactId: contact?.id,
          dealId: deal?.id,
          assignedUserId,
          issueDate,
          validUntil: addCalendarDays(issueDate, 30),
        }}
      />
    </div>
  );
}
