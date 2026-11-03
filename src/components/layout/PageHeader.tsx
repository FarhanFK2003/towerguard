import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level; use "h2" when the page has its own primary heading elsewhere. */
  as?: "h1" | "h2";
}

export function PageHeader({ eyebrow, title, description, actions, as: Heading = "h1" }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">{eyebrow}</p>
        ) : null}
        <Heading className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</Heading>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
