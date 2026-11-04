import type { Metadata } from "next";
import { UpcomingEventsSection } from "@/modules/calendar/components/upcoming-section";
import { Suspense } from "react";
import { requireUser } from "@/server/rbac";
import { AttentionSection } from "@/modules/reminders/components/attention-section";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCards, KpiCardsSkeleton } from "@/modules/dashboard/components/kpi-cards";
import { PipelinePreviewSection } from "@/modules/dashboard/components/pipeline-preview-section";
import {
  RecentActivitySection,
  RecentActivitySectionSkeleton,
} from "@/modules/dashboard/components/recent-activity-section";
import {
  TasksTodaySection,
  TasksTodaySectionSkeleton,
} from "@/modules/dashboard/components/tasks-today-section";

export const metadata: Metadata = {
  title: "Dashboard – RDEvolution CRM",
};

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-sm">Termine laden …</p>}><UpcomingEventsSection/></Suspense>
      <Suspense fallback={<KpiCardsSkeleton />}>
        <KpiCards />
      </Suspense>

      <Suspense fallback={null}>
        <AttentionSection user={user} />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<TasksTodaySectionSkeleton />}>
          <TasksTodaySection />
        </Suspense>
        <Suspense fallback={<RecentActivitySectionSkeleton />}>
          <RecentActivitySection />
        </Suspense>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        }
      >
        <PipelinePreviewSection />
      </Suspense>
    </div>
  );
}
