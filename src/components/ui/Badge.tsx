import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-300/70",
  info: "bg-sky-50 text-sky-800 ring-sky-300/70",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-300/70",
  warning: "bg-amber-50 text-amber-800 ring-amber-300/70",
  danger: "bg-red-50 text-red-800 ring-red-300/70",
  accent: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", icon, className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
