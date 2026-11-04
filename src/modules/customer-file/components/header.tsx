import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { CallLogDialog } from "./call-log-dialog";
import { scopeIdField, scopeQuery, type FileScope, type TabKey } from "../scope";

export type HeaderFact = { label: string; value: ReactNode };

// Kopfbereich: Name, Status, Verantwortlicher (immer sichtbar) und die
// wichtigsten Stammdaten als kompakte Faktenzeile.
export function EntityHeader({
  title,
  badges,
  subtitle,
  assignee,
  facts,
  actions,
}: {
  title: string;
  badges?: ReactNode;
  subtitle?: ReactNode;
  assignee: { firstName: string; lastName: string } | null;
  facts: HeaderFact[];
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 break-words">
          <h2 className="text-lg font-semibold text-black">{title}</h2>
          {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {badges}
            {assignee ? (
              <span className="text-sm text-secondary">
                Verantwortlich:{" "}
                <strong className="font-medium text-black">
                  {assignee.firstName} {assignee.lastName}
                </strong>
              </span>
            ) : (
              <Badge variant="gold">Kein Verantwortlicher zugewiesen</Badge>
            )}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
      {facts.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {facts.map((fact) => (
            <div key={fact.label} className="min-w-0">
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="break-words text-black">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

const actionClass =
  "inline-flex items-center justify-center rounded-md border border-control-border px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-foreground";

// Schnellaktionen: nur die zur Akte passenden, über die bestehenden Flows.
export function QuickActions({
  scope,
  assignedUserId,
  canEmail,
  canSetFollowUp = false,
  basePath,
}: {
  scope: FileScope;
  assignedUserId?: string | null;
  canEmail: boolean;
  canSetFollowUp?: boolean;
  basePath: string;
}) {
  const target = { [scopeIdField(scope)]: scope.id } as Record<string, string>;
  return (
    <nav aria-label="Schnellaktionen" className="flex flex-wrap gap-2">
      <CallLogDialog target={target} canSetFollowUp={canSetFollowUp} />
      {canEmail ? (
        <Link href={`/emails/new?${scopeQuery(scope)}`} className={actionClass}>
          E-Mail schreiben
        </Link>
      ) : (
        <span className="inline-flex items-center px-1 text-xs text-muted">
          E-Mail: Kontakt mit E-Mail-Adresse nötig
        </span>
      )}
      <Link href={`/tasks/new?${scopeQuery(scope, { assignedUserId })}`} className={actionClass}>
        Aufgabe erstellen
      </Link>
      <Link href={`/calendar/new?${scopeQuery(scope, { assignedUserId })}`} className={actionClass}>
        Termin erstellen
      </Link>
      <Link href={`${basePath}?tab=overview#notizen`} className={actionClass}>
        Notiz erstellen
      </Link>
    </nav>
  );
}

export function EntityTabs({
  basePath,
  tabs,
  active,
}: {
  basePath: string;
  tabs: { key: TabKey; label: string }[];
  active: TabKey;
}) {
  return (
    <nav aria-label="Bereiche" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex min-w-max gap-1 border-b border-black/10">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={`${basePath}?tab=${tab.key}`}
              aria-current={tab.key === active ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-3 py-2 text-sm whitespace-nowrap",
                tab.key === active
                  ? "border-[var(--gold)] font-medium text-black"
                  : "border-transparent text-secondary hover:text-black",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
