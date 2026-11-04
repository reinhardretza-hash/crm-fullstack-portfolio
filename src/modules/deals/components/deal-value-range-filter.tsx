"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { buildFilterUrl } from "@/lib/search-params";
import { euroToCents } from "@/lib/money";

// Wie RangeFilter, aber Euro<->Cent-Umrechnung inline - die URL trägt Cent
// (Money-Strategie), die Eingabe bleibt für Menschen in Euro.
export function DealValueRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const minCents = searchParams.get("valueMinCents");
  const maxCents = searchParams.get("valueMaxCents");

  function toEuroDisplay(cents: string | null): string {
    if (!cents) return "";
    const parsed = Number.parseInt(cents, 10);
    return Number.isFinite(parsed) ? String(parsed / 100) : "";
  }

  function handleChange(paramKey: "valueMinCents" | "valueMaxCents", euroValue: string) {
    let cents: string | undefined;
    try {
      cents = euroValue ? String(euroToCents(euroValue)) : undefined;
    } catch {
      cents = undefined;
    }
    router.push(buildFilterUrl(pathname, searchParams, { [paramKey]: cents }));
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-secondary">
      Wertebereich (€)
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          defaultValue={toEuroDisplay(minCents)}
          placeholder="von"
          onBlur={(event) => handleChange("valueMinCents", event.target.value)}
          className="w-28 rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
        <span className="text-muted">–</span>
        <input
          type="number"
          defaultValue={toEuroDisplay(maxCents)}
          placeholder="bis"
          onBlur={(event) => handleChange("valueMaxCents", event.target.value)}
          className="w-28 rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
      </div>
    </div>
  );
}
