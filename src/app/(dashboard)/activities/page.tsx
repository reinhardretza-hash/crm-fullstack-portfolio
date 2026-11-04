import type { Metadata } from "next";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { hasPermission } from "@/server/permissions";
import { requireUser } from "@/server/rbac";
import { ActivityFiltersBar } from "@/modules/activity/components/activity-filters";
import { ActivityList } from "@/modules/activity/components/activity-list";
import { listActivities } from "@/modules/activity/queries";
import { activityFiltersSchema } from "@/validations/activity";

export const metadata: Metadata = {
  title: "Aktivitäten – RDEvolution CRM",
};

type ActivitiesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FILTER_KEYS = [
  "q",
  "type",
  "category",
  "userId",
  "companyId",
  "contactId",
  "leadId",
  "dealId",
  "dateFrom",
  "dateTo",
];

export default async function ActivitiesPage({ searchParams }: ActivitiesPageProps) {
  // Auth/aktiver Benutzer wird bereits im Dashboard-Layout erzwungen; hier
  // zusätzlich für die Rechteprüfung der E-Mail-Links benötigt.
  const user = await requireUser();
  const rawParams = await searchParams;
  const filters = activityFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);
  const hasFilters = FILTER_KEYS.some((key) => {
    const value = rawParams[key];
    return typeof value === "string" ? value !== "" : Array.isArray(value) && value.length > 0;
  });

  const { activities, totalCount, totalPages } = await listActivities(filters, pagination);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Aktivitäten</h2>

      <Suspense>
        <ActivityFiltersBar />
      </Suspense>

      <Card>
        <ActivityList
          activities={activities}
          hasFilters={hasFilters}
          canViewEmails={hasPermission(user, "EMAIL_SEND")}
        />
        {activities.length > 0 && (
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalPages={totalPages}
            totalCount={totalCount}
          />
        )}
      </Card>
    </div>
  );
}
