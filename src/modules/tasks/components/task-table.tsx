import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TasksIcon } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Priority, TaskStatus } from "@/generated/prisma/client";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/crm-labels";
import { buildFilterUrl } from "@/lib/search-params";
import type { TaskFilters } from "@/validations/task";
import { isTaskOverdue } from "../due";
import { taskCrmTargetHref, taskCrmTargetLabel } from "../helpers";
import { TaskQuickCompleteButton } from "./task-quick-complete-button";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

type TaskListItem = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueAt: Date;
  version: number;
  updatedAt: Date;
  company: { id: string; name: string } | null;
  contact: { id: string; firstName: string | null; lastName: string | null } | null;
  lead: { id: string; title: string } | null;
  deal: { id: string; name: string } | null;
  assignedUser: { firstName: string; lastName: string } | null;
};

type TaskTableProps = {
  tasks: TaskListItem[];
  filters: TaskFilters;
  searchParams: URLSearchParams;
};

function SortableHead({
  label,
  sortKey,
  filters,
  searchParams,
}: {
  label: string;
  sortKey: TaskFilters["sort"];
  filters: TaskFilters;
  searchParams: URLSearchParams;
}) {
  const isActive = filters.sort === sortKey;
  const nextDirection = isActive && filters.direction === "asc" ? "desc" : "asc";
  const href = buildFilterUrl("/tasks", searchParams, {
    sort: sortKey,
    direction: nextDirection,
    page: "1",
  });

  return (
    <TableHead>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-black">
        {label}
        {isActive && <span aria-hidden="true">{filters.direction === "asc" ? "↑" : "↓"}</span>}
      </Link>
    </TableHead>
  );
}

export function TaskTable({ tasks, filters, searchParams }: TaskTableProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<TasksIcon className="h-8 w-8" />}
        title="Keine Aufgaben in dieser Ansicht."
        action={
          <Link
            href="/tasks/new"
            className="rounded-md bg-[var(--gold)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--gold)]/90"
          >
            + Aufgabe erstellen
          </Link>
        }
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead
            label="Aufgabe"
            sortKey="title"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Status</TableHead>
          <SortableHead
            label="Priorität"
            sortKey="priority"
            filters={filters}
            searchParams={searchParams}
          />
          <SortableHead
            label="Fällig"
            sortKey="dueAt"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>Verantwortlicher</TableHead>
          <TableHead>Verknüpft mit</TableHead>
          <SortableHead
            label="Aktualisiert"
            sortKey="updatedAt"
            filters={filters}
            searchParams={searchParams}
          />
          <TableHead>
            <span className="sr-only">Aktionen</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => {
          const overdue = isTaskOverdue(task);
          const targetLabel = taskCrmTargetLabel(task);
          const targetHref = taskCrmTargetHref(task);
          return (
            <TableRow key={task.id}>
              <TableCell className="font-medium text-black">
                <Link href={`/tasks/${task.id}`} className="hover:underline">
                  {task.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={task.status === "COMPLETED" ? "gold" : "neutral"}>
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    task.priority === "VERY_HIGH" || task.priority === "HIGH" ? "gold" : "neutral"
                  }
                >
                  {PRIORITY_LABELS[task.priority]}
                </Badge>
              </TableCell>
              <TableCell>
                <span className={overdue ? "font-medium text-red-600" : undefined}>
                  {DATE_FORMATTER.format(task.dueAt)}
                  {overdue && " (überfällig)"}
                </span>
              </TableCell>
              <TableCell>
                {task.assignedUser
                  ? `${task.assignedUser.firstName} ${task.assignedUser.lastName}`
                  : "–"}
              </TableCell>
              <TableCell>
                {targetLabel && targetHref ? (
                  <Link href={targetHref} className="hover:underline">
                    {targetLabel}
                  </Link>
                ) : (
                  "–"
                )}
              </TableCell>
              <TableCell>{DATE_FORMATTER.format(task.updatedAt)}</TableCell>
              <TableCell>
                {task.status !== "COMPLETED" && (
                  <TaskQuickCompleteButton taskId={task.id} version={task.version} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
