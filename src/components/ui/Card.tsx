import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, icon, action, className }: CardHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 text-slate-500 [&_svg]:size-5" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
