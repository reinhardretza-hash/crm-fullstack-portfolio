import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/filters/pagination-controls";
import { parsePaginationParams } from "@/lib/pagination";
import { toURLSearchParams } from "@/lib/search-params";
import { TaskFiltersBar } from "@/modules/tasks/components/task-filters";
import { TaskTable } from "@/modules/tasks/components/task-table";
import { TaskViewTabs } from "@/modules/tasks/components/task-view-tabs";
import { listTasks } from "@/modules/tasks/queries";
import { taskFiltersSchema } from "@/validations/task";

export const metadata: Metadata = {
  title: "Aufgaben – RDEvolution CRM",
};

type TasksPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const rawParams = await searchParams;
  const filters = taskFiltersSchema.parse(rawParams);
  const pagination = parsePaginationParams(rawParams);

  const { tasks, totalCount, totalPages } = await listTasks(filters, pagination);
  const currentSearchParams = toURLSearchParams(rawParams);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black">Aufgaben</h2>
        <Link
          href="/tasks/new"
          className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
        >
          + Aufgabe erstellen
        </Link>
      </div>

      <TaskViewTabs />

      <Suspense>
        <TaskFiltersBar />
      </Suspense>

      <Card>
        <TaskTable tasks={tasks} filters={filters} searchParams={currentSearchParams} />
        {tasks.length > 0 && (
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
