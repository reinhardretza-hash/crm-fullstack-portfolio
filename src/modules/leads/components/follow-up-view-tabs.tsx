"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildFilterUrl } from "@/lib/search-params";
import type { FollowUpView } from "@/validations/lead";

const VIEWS: { value: FollowUpView; label: string }[] = [
  { value: "overdue", label: "Überfällig" },
  { value: "today", label: "Heute" },
  { value: "upcoming", label: "Kommend" },
  { value: "all", label: "Alle" },
];

export function FollowUpViewTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") ?? "all";

  return (
    <div className="flex flex-wrap gap-1.5">
      {VIEWS.map((view) => {
        const isActive = currentView === view.value;
        const href = buildFilterUrl(pathname, searchParams, { view: view.value });
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
