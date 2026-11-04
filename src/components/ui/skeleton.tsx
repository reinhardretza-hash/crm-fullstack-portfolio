import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Nur für tatsächlich asynchron nachladende Inhalte (Suspense-Fallback) -
// keine dekorative/künstliche Ladeanimation ohne echten Zweck.
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      aria-label="Wird geladen"
      className={cn("animate-pulse rounded-md bg-black/5", className)}
      {...props}
    />
  );
}
