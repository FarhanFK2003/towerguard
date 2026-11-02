import type { ReactNode } from "react";
import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export type CalloutTone = "info" | "warning" | "danger";

const TONES: Record<CalloutTone, { container: string; icon: ReactNode }> = {
  info: {
    container: "border-sky-200 bg-sky-50 text-sky-900",
    icon: <Info className="text-sky-600" />,
  },
  warning: {
    container: "border-amber-300 bg-amber-50 text-amber-950",
    icon: <TriangleAlert className="text-amber-600" />,
  },
  danger: {
    container: "border-red-200 bg-red-50 text-red-900",
    icon: <CircleAlert className="text-red-600" />,
  },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title: string;
  children?: ReactNode;
  className?: string;
}

export function Callout({ tone = "info", title, children, className }: CalloutProps) {
  const { container, icon } = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "note"}
      className={cn("flex gap-3 rounded-lg border p-4 text-sm", container, className)}
    >
      <span className="shrink-0 [&_svg]:size-5" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-semibold">{title}</p>
        {children ? <div className="leading-relaxed opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
