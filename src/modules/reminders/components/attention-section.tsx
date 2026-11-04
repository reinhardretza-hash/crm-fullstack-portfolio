import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { User } from "@/generated/prisma/client";
import { dismissReminderAction } from "../actions";
import { listAttentionReminders } from "../queries";
import { REMINDER_TYPE_LABELS } from "../rules";

export async function AttentionSection({ user }: { user: Pick<User, "id" | "role"> }) {
  const { items, total } = await listAttentionReminders(user);
  const showAssignee = user.role !== "USER";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benötigt Aufmerksamkeit</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="Aktuell gibt es nichts, das Aufmerksamkeit benötigt." />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="break-words">
                    <span className="text-secondary">{REMINDER_TYPE_LABELS[item.type]}: </span>
                    {item.target ? (
                      <Link
                        href={item.target.href}
                        className="font-medium text-black hover:underline"
                      >
                        {item.target.label}
                      </Link>
                    ) : (
                      "–"
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {item.status === "NO_ASSIGNEE" && (
                      <Badge variant="gold">Kein Verantwortlicher zugewiesen</Badge>
                    )}
                    {item.status === "INACTIVE_ASSIGNEE" && (
                      <Badge variant="gold">Kein aktiver Verantwortlicher</Badge>
                    )}
                    {item.status === "FAILED" && (
                      <Badge variant="neutral">E-Mail fehlgeschlagen</Badge>
                    )}
                    {showAssignee && item.assigneeName && <span>{item.assigneeName}</span>}
                    <span>
                      {item.daysOpen === 0
                        ? "heute erkannt"
                        : `seit ${item.daysOpen} ${item.daysOpen === 1 ? "Tag" : "Tagen"} erkannt`}
                    </span>
                  </span>
                </div>
                <form action={dismissReminderAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="shrink-0 text-xs text-secondary underline hover:no-underline"
                    aria-label="Erinnerung schließen"
                  >
                    Schließen
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {total > items.length && (
          <p className="mt-3 text-xs text-muted">… und {total - items.length} weitere.</p>
        )}
      </CardContent>
    </Card>
  );
}
