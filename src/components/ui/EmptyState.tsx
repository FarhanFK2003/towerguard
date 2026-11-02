import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className="flex size-12 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200 [&_svg]:size-6"
        aria-hidden="true"
      >
        {icon}
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
