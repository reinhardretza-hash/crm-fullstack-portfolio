"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildFilterUrl } from "@/lib/search-params";
import type { TaskView } from "@/validations/task";

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "open", label: "Alle offenen" },
  { value: "today", label: "Heute" },
  { value: "overdue", label: "Überfällig" },
  { value: "upcoming", label: "Kommend" },
  { value: "done", label: "Erledigt" },
  { value: "all", label: "Alle" },
];

// Schnelle Ansichten über URL-Filter statt getrennter Seiten (siehe
// Vorgabe Punkt 14) - jede Ansicht bleibt dadurch linkbar/teilbar.
export function TaskViewTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") ?? "open";

  return (
    <div className="flex flex-wrap gap-1.5">
      {VIEWS.map((view) => {
        const isActive = currentView === view.value;
        const href = buildFilterUrl(pathname, searchParams, { view: view.value, page: "1" });
        return (
          <Link
            key={view.value}
            href={href}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              isActive
                ? "bg-[var(--gold)] text-black"
                : "bg-black/5 text-secondary hover:bg-black/10"
            }`}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
