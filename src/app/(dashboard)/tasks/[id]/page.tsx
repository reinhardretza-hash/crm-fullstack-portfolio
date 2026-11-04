import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "@/modules/activity/components/timeline";
import { getTaskById } from "@/modules/tasks/queries";
import { isTaskOverdue } from "@/modules/tasks/due";
import { taskCrmTargetHref, taskCrmTargetLabel } from "@/modules/tasks/helpers";
import { TaskStatusActions } from "@/modules/tasks/components/task-status-actions";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/crm-labels";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
  timeStyle: "short",
});

type TaskDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: TaskDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const task = await getTaskById(id);
  return { title: task ? `${task.title} – RDEvolution CRM` : "Aufgabe – RDEvolution CRM" };
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { id } = await params;
  const task = await getTaskById(id);

  if (!task) {
    notFound();
  }

  const overdue = isTaskOverdue(task);
  const targetLabel = taskCrmTargetLabel(task);
  const targetHref = taskCrmTargetHref(task);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-black">{task.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={task.status === "COMPLETED" ? "gold" : "neutral"}>
              {TASK_STATUS_LABELS[task.status]}
            </Badge>
            <Badge
              variant={
                task.priority === "VERY_HIGH" || task.priority === "HIGH" ? "gold" : "neutral"
              }
            >
              {PRIORITY_LABELS[task.priority]}
            </Badge>
            {overdue && (
              <Badge variant="neutral" className="bg-red-100 text-red-700">
                Überfällig
              </Badge>
            )}
          </div>
        </div>
        <Link href={`/tasks/${task.id}/edit`}>
          <Button variant="secondary">Bearbeiten</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <DataRow label="Fällig am" value={{ text: DATE_TIME_FORMATTER.format(task.dueAt) }} />
              <DataRow
                label="Erinnerung"
                value={
                  task.reminderAt
                    ? { text: DATE_TIME_FORMATTER.format(task.reminderAt) }
                    : undefined
                }
              />
              <DataRow
                label="Erledigt am"
                value={
                  task.completedAt
                    ? { text: DATE_TIME_FORMATTER.format(task.completedAt) }
                    : undefined
                }
              />
              <DataRow
                label="Verantwortlicher"
                value={{ text: `${task.assignedUser.firstName} ${task.assignedUser.lastName}` }}
              />
              <DataRow
                label="Verknüpft mit"
                value={
                  targetLabel ? { text: targetLabel, href: targetHref ?? undefined } : undefined
                }
              />
              <DataRow
                label="Erstellt von"
                value={{ text: `${task.createdBy.firstName} ${task.createdBy.lastName}` }}
              />
            </CardContent>
          </Card>

          {task.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-black/80">{task.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Aktionen</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskStatusActions taskId={task.id} status={task.status} version={task.version} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline activities={task.activities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: { text: string; href?: string } }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      {value ? (
        value.href ? (
          <Link href={value.href} className="text-black hover:underline">
            {value.text}
          </Link>
        ) : (
          <p className="text-black/80">{value.text}</p>
        )
      ) : (
        <p className="text-muted">–</p>
      )}
    </div>
  );
}
