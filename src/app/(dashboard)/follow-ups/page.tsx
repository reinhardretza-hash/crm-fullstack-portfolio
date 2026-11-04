import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { FollowUpTable } from "@/modules/leads/components/follow-up-table";
import { FollowUpViewTabs } from "@/modules/leads/components/follow-up-view-tabs";
import { listFollowUps, countFollowUps } from "@/modules/leads/queries";
import { Suspense } from "react";
import { parsePaginationParams, getTotalPages } from "@/lib/pagination";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { followUpFiltersSchema } from "@/validations/lead";

export const metadata: Metadata = {
  title: "Follow-ups – RDEvolution CRM",
};

type FollowUpsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function FollowUpsPage({ searchParams }: FollowUpsPageProps) {
  const rawParams = await searchParams;
  const parsed = followUpFiltersSchema.safeParse(rawParams);
  const filters = parsed.success ? parsed.data : followUpFiltersSchema.parse({});
  const pagination = parsePaginationParams(rawParams);
  const now = new Date();
  const [leads, totalCount] = await Promise.all([
    listFollowUps(filters, now, pagination),
    countFollowUps(filters, now),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold text-black">Follow-ups</h2>
      <FollowUpViewTabs />
      <Card>
        <FollowUpTable leads={leads} />
        <Suspense>
          <PaginationControls
            {...pagination}
            totalCount={totalCount}
            totalPages={getTotalPages(totalCount, pagination.pageSize)}
          />
        </Suspense>
      </Card>
    </div>
  );
}
