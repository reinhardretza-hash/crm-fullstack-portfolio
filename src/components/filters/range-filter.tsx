"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { buildFilterUrl } from "@/lib/search-params";

type RangeFilterProps = {
  label: string;
  type: "number" | "date";
  minParamKey: string;
  maxParamKey: string;
};

// Generisches Min/Max-Filterpaar über URL Search Params (Wertebereich,
// Abschlussdatum-Zeitraum) - dasselbe Prinzip wie SelectFilter, aber für
// zwei zusammengehörige Werte statt einer festen Optionsliste.
export function RangeFilter({ label, type, minParamKey, maxParamKey }: RangeFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const minValue = searchParams.get(minParamKey) ?? "";
  const maxValue = searchParams.get(maxParamKey) ?? "";

  return (
    <div className="flex flex-col gap-1 text-xs text-secondary">
      {label}
      <div className="flex items-center gap-1.5">
        <input
          type={type}
          value={minValue}
          placeholder="von"
          onChange={(event) => {
            router.push(
              buildFilterUrl(pathname, searchParams, { [minParamKey]: event.target.value }),
            );
          }}
          className="w-28 rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
        <span className="text-muted">–</span>
        <input
          type={type}
          value={maxValue}
          placeholder="bis"
          onChange={(event) => {
            router.push(
              buildFilterUrl(pathname, searchParams, { [maxParamKey]: event.target.value }),
            );
          }}
          className="w-28 rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]"
        />
      </div>
    </div>
  );
}
