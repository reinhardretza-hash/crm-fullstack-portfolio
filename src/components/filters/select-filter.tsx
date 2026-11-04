"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { buildFilterUrl } from "@/lib/search-params";

type SelectFilterOption = {
  value: string;
  label: string;
};

type SelectFilterProps = {
  paramKey: string;
  label: string;
  allLabel: string;
  options: SelectFilterOption[];
};

export function SelectFilter({ paramKey, label, allLabel, options }: SelectFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(paramKey) ?? "";

  return (
    <label className="flex flex-col gap-1 text-xs text-secondary">
      {label}
      <select
        value={value}
        onChange={(event) => {
          router.push(buildFilterUrl(pathname, searchParams, { [paramKey]: event.target.value }));
        }}
        className="rounded-md border border-black/15 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-[var(--gold)]"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
