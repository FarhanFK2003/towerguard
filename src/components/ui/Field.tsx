import type { ComponentProps, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Small control shown at the right of the label, e.g. a "Use today" button. */
  labelAction?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** ID of the element that describes a control (error takes precedence over hint). */
export function describedBy(id: string, { error, hint }: { error?: string; hint?: string }) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function Field({ id, label, required, hint, error, labelAction, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
          {required ? (
            <span className="text-red-600" aria-hidden="true">
              {" "}
              *
            </span>
          ) : (
            <span className="font-normal text-slate-500"> (optional)</span>
          )}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-red-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "block w-full rounded-md border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function controlState(invalid: boolean | undefined) {
  return invalid
    ? "border-red-400 focus:border-red-500 focus:ring-red-500/30"
    : "border-slate-300 focus:border-amber-500 focus:ring-amber-500/30";
}

type ControlProps = { invalid?: boolean };

export function Input({ invalid, className, ...props }: ComponentProps<"input"> & ControlProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-10", controlState(invalid), className)}
      {...props}
    />
  );
}

export function Select({ invalid, className, ...props }: ComponentProps<"select"> & ControlProps) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-10 pr-8", controlState(invalid), className)}
      {...props}
    />
  );
}

export function Textarea({ invalid, className, ...props }: ComponentProps<"textarea"> & ControlProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "min-h-28 py-2", controlState(invalid), className)}
      {...props}
    />
  );
}
