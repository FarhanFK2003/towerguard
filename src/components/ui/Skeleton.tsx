import { cn } from "@/lib/cn";

/** Pulsing placeholder block shown while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-slate-200", className)} aria-hidden="true" />;
}
