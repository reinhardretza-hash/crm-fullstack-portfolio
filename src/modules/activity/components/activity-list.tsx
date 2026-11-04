import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ACTIVITY_CATEGORY_BY_TYPE,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_LABELS,
  activityTarget,
  contactLabel,
  describeActivityDetail,
  type ActivityTarget,
  type ActivityTargetSource,
} from "../catalog";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

export type ActivityListRow = ActivityTargetSource & {
  id: string;
  createdAt: Date;
  user: { firstName: string; lastName: string } | null;
};

type ActivityListProps = {
  activities: ActivityListRow[];
  hasFilters: boolean;
  canViewEmails: boolean;
};

function TargetText({ target }: { target: ActivityTarget }) {
  if (target.deleted) {
    return (
      <span className="text-secondary">
        {target.label} <span className="text-muted">(gelöscht)</span>
      </span>
    );
  }
  if (!target.href) return <span className="text-secondary">{target.label}</span>;
  return (
    <Link href={target.href} className="font-medium text-black hover:underline">
      {target.label}
    </Link>
  );
}

function ContextChips({ row, exclude }: { row: ActivityListRow; exclude?: string }) {
  const items: { key: string; label: string; href: string; deleted: boolean }[] = [];
  if (row.company) {
    items.push({
      key: "company",
      label: row.company.name,
      href: `/companies/${row.company.id}`,
      deleted: !!row.company.deletedAt,
    });
  }
  if (row.contact) {
    items.push({
      key: "contact",
      label: contactLabel(row.contact),
      href: `/contacts/${row.contact.id}`,
      deleted: !!row.contact.deletedAt,
    });
  }
  if (row.lead) {
    items.push({
      key: "lead",
      label: row.lead.title,
      href: `/leads/${row.lead.id}`,
      deleted: !!row.lead.deletedAt,
    });
  }
  if (row.deal) {
    items.push({
      key: "deal",
      label: row.deal.name,
      href: `/deals/${row.deal.id}`,
      deleted: !!row.deal.deletedAt,
    });
  }
  const visible = items.filter((item) => item.key !== exclude);
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
      {visible.map((item) =>
        item.deleted ? (
          <span key={item.key}>{item.label} (gelöscht)</span>
        ) : (
          <Link key={item.key} href={item.href} className="hover:underline">
            {item.label}
          </Link>
        ),
      )}
    </div>
  );
}

export function ActivityList({ activities, hasFilters, canViewEmails }: ActivityListProps) {
  if (activities.length === 0) {
    return (
      <EmptyState
        title={
          hasFilters
            ? "Keine Aktivitäten für diese Filter gefunden."
            : "Noch keine Aktivitäten vorhanden."
        }
      />
    );
  }

  return (
    <ol className="divide-y divide-black/10">
      {activities.map((row) => {
        const target = activityTarget(row, { canViewEmails });
        const detail = describeActivityDetail(row.type, row.metadata);
        return (
          <li key={row.id} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-black">{ACTIVITY_LABELS[row.type]}</span>
              <Badge variant="neutral">
                {ACTIVITY_CATEGORY_LABELS[ACTIVITY_CATEGORY_BY_TYPE[row.type]]}
              </Badge>
              <span className="text-xs text-muted">
                {DATE_TIME_FORMATTER.format(row.createdAt)}
                {row.user ? ` · ${row.user.firstName} ${row.user.lastName}` : ""}
              </span>
            </div>
            {target && (
              <div className="break-words">
                <TargetText target={target} />
              </div>
            )}
            {detail && <p className="text-xs break-words text-secondary">{detail}</p>}
            <ContextChips row={row} exclude={target?.kind} />
          </li>
        );
      })}
    </ol>
  );
}
