import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TasksIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { PRIORITY_LABELS } from "@/lib/crm-labels";
import { listTodaysTasksForDashboard } from "@/modules/tasks/queries";
import { TaskQuickCompleteButton } from "@/modules/tasks/components/task-quick-complete-button";
import { taskCrmTargetLabel } from "@/modules/tasks/helpers";

const TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

export async function TasksTodaySection() {
  const tasks = await listTodaysTasksForDashboard();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Aufgaben heute</CardTitle>
        <Link href="/tasks?view=today" className="text-xs text-muted hover:underline">
          Alle Aufgaben anzeigen
        </Link>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <EmptyState icon={<TasksIcon className="h-8 w-8" />} title="Keine Aufgaben für heute." />
        ) : (
          <ul className="flex flex-col gap-3">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium text-black hover:underline"
                  >
                    {task.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <Badge
                      variant={
                        task.priority === "VERY_HIGH" || task.priority === "HIGH"
                          ? "gold"
                          : "neutral"
                      }
                    >
                      {PRIORITY_LABELS[task.priority]}
                    </Badge>
                    <span>{TIME_FORMATTER.format(task.dueAt)} Uhr</span>
                    {taskCrmTargetLabel(task) && <span>· {taskCrmTargetLabel(task)}</span>}
                    {task.assignedUser && (
                      <span>
                        · {task.assignedUser.firstName} {task.assignedUser.lastName}
                      </span>
                    )}
                  </div>
                </div>
                <TaskQuickCompleteButton taskId={task.id} version={task.version} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TasksTodaySectionSkeleton() {
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
