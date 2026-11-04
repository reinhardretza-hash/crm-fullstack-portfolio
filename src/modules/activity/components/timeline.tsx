import { EmptyState } from "@/components/ui/empty-state";
import type { ActivityType } from "@/generated/prisma/client";
import { ACTIVITY_LABELS, describeActivityDetail } from "../catalog";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

type TimelineProps = {
  activities: {
    id: string;
    type: ActivityType;
    createdAt: Date;
    metadata?: unknown;
    user: { firstName: string; lastName: string } | null;
  }[];
};

export function Timeline({ activities }: TimelineProps) {
  if (activities.length === 0) {
    return <EmptyState title="Noch keine Aktivitäten vorhanden." />;
  }

  return (
    <ol className="flex flex-col gap-3">
      {activities.map((activity) => {
        const detail = describeActivityDetail(activity.type, activity.metadata);
        return (
          <li key={activity.id} className="flex flex-col gap-0.5 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="text-black/80">{ACTIVITY_LABELS[activity.type]}</span>
              <span className="text-xs text-muted">
                {activity.user ? `${activity.user.firstName} ${activity.user.lastName} · ` : ""}
                {DATE_TIME_FORMATTER.format(activity.createdAt)}
              </span>
            </div>
            {detail && <span className="text-xs text-muted break-words">{detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}
