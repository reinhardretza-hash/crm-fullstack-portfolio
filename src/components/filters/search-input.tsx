"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { buildFilterUrl } from "@/lib/search-params";

type SearchInputProps = {
  placeholder?: string;
  paramKey?: string;
};

const DEBOUNCE_MS = 350;

export function SearchInput({ placeholder = "Suchen...", paramKey = "q" }: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlValue = searchParams.get(paramKey) ?? "";

  function handleChange(next: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      router.push(buildFilterUrl(pathname, searchParams, { [paramKey]: next }));
    }, DEBOUNCE_MS);
  }

  return (
    <input
      // Unkontrolliert (defaultValue + key statt value+onChange) - das
      // Debounce schreibt die URL, nicht jeden Tastendruck zurück in einen
      // React-State. `key` sorgt dafür, dass das Feld neu gemountet wird
      // (und damit den aktuellen URL-Wert übernimmt), wenn sich der
      // Suchbegriff von außen ändert (z. B. Browser-Zurück oder Filter-Reset).
      key={urlValue}
      type="search"
      defaultValue={urlValue}
      onChange={(event) => handleChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full max-w-xs rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--gold)] sm:max-w-sm"
    />
  );
}
