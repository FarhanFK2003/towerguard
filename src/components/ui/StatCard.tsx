import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatTone = "neutral" | "info" | "warning" | "success";

const ICON_TONES: Record<StatTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  success: "bg-emerald-100 text-emerald-700",
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

export function StatCard({ label, value, icon, hint, tone = "neutral", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5",
          ICON_TONES[tone],
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}
