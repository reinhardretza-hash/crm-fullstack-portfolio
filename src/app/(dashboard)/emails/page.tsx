import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/rbac";
import { emailFiltersSchema } from "@/validations/email";
import { listEmails, listEmailSenders } from "@/modules/email/queries";
import { EmailTable, EMAIL_STATUS_LABELS } from "@/modules/email/components/email-table";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
export const metadata = { title: "E-Mails – RDEvolution CRM" };
export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const raw = await searchParams;
  const values = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = emailFiltersSchema.safeParse(values);
  const pagination = parsePaginationParams(raw);
  const [{ messages, totalCount, totalPages }, users] = await Promise.all([
    listEmails(parsed.success ? parsed.data : {}, pagination),
    listEmailSenders(),
  ]);
  const cls = "rounded-md border border-black/15 bg-white px-3 py-2 text-sm";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Gesendete E-Mails</h2>
        <Link href="/emails/new" className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm">
          E-Mail schreiben
        </Link>
      </div>
      <p className="text-xs text-muted">
        Ausgehende E-Mails einschließlich unbestätigter und fehlgeschlagener Versandanfragen.
      </p>
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="text-xs">
          Suche
          <input
            name="q"
            defaultValue={values.q}
            className={`${cls} block`}
            placeholder="Empfänger, Betreff, Kontakt, Unternehmen"
          />
        </label>
        <label className="text-xs">
          Status
          <select name="status" defaultValue={values.status || ""} className={`${cls} block`}>
            <option value="">Alle</option>
            {Object.entries(EMAIL_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Benutzer
          <select name="userId" defaultValue={values.userId || ""} className={`${cls} block`}>
            <option value="">Alle</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Von
          <input
            className={`${cls} block`}
            name="dateFrom"
            type="date"
            defaultValue={values.dateFrom}
          />
        </label>
        <label className="text-xs">
          Bis
          <input
            className={`${cls} block`}
            name="dateTo"
            type="date"
            defaultValue={values.dateTo}
          />
        </label>
        <button className={cls} type="submit">
          Filtern
        </button>
        <Link href="/emails" className="text-sm underline">
          Zurücksetzen
        </Link>
      </form>
      {!parsed.success && (
        <p role="alert" className="text-sm text-red-700">
          Bitte die Filter prüfen: {parsed.error.issues[0]?.message}
        </p>
      )}
      <div className="rounded-lg border border-black/10">
        <EmailTable messages={messages} />
        <Suspense>
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        </Suspense>
      </div>
    </div>
  );
}
