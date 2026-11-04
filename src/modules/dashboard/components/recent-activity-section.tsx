import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivitiesIcon } from "@/components/ui/icons";
import { getRecentActivities } from "../queries";

export async function RecentActivitySection() {
  const activities = await getRecentActivities();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Neueste Aktivitäten</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <EmptyState
            icon={<ActivitiesIcon className="h-8 w-8" />}
            title="Noch keine Aktivitäten vorhanden."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {activities.map((activity) => (
              <li key={activity.id} className="text-sm text-black/80">
                {activity.description}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RecentActivitySectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}
