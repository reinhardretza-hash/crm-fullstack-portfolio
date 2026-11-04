import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Priority, TaskStatus } from "@/generated/prisma/client";
import { PRIORITY_LABELS } from "@/lib/crm-labels";
import { isTaskOverdue } from "../due";

const DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  dateStyle: "short",
});

type CompactTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  dueAt: Date;
};

type TaskCompactListProps = {
  tasks: CompactTask[];
};

// Für die kompakten Aufgaben-Sektionen auf Company-/Contact-/Lead-/Deal-
// Detailseiten (siehe Vorgabe Punkt 33) - zeigt bewusst nur offene
// Aufgaben (bereits in der Query gefiltert), nicht sämtliche erledigten.
export function TaskCompactList({ tasks }: TaskCompactListProps) {
  if (tasks.length === 0) {
    return <p className="text-sm text-muted">Keine offenen Aufgaben.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => {
        const overdue = isTaskOverdue(task);
        return (
          <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
            <Link href={`/tasks/${task.id}`} className="text-black hover:underline">
              {task.title}
            </Link>
            <div className="flex items-center gap-2 text-secondary">
              <Badge
                variant={
                  task.priority === "VERY_HIGH" || task.priority === "HIGH" ? "gold" : "neutral"
                }
              >
                {PRIORITY_LABELS[task.priority]}
              </Badge>
              <span className={overdue ? "font-medium text-red-600" : undefined}>
                {DATE_FORMATTER.format(task.dueAt)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
