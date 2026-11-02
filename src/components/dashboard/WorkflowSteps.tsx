import type { LucideIcon } from "lucide-react";
import { ClipboardPlus, Crosshair, FileText, ImageUp, ListChecks } from "lucide-react";

interface Step {
  title: string;
  description: string;
  icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  {
    title: "Create inspection",
    description: "Record the site, structure type, inspector and inspection date.",
    icon: ClipboardPlus,
  },
  {
    title: "Upload photographs",
    description: "Originals are preserved unchanged and fingerprinted with SHA-256.",
    icon: ImageUp,
  },
  {
    title: "Annotate regions",
    description: "Mark visible areas of concern with rectangles and points.",
    icon: Crosshair,
  },
  {
    title: "Record and review observations",
    description: "Link observations to annotated evidence, then confirm or dismiss them.",
    icon: ListChecks,
  },
  {
    title: "Export report",
    description: "Print an evidence-backed report to PDF, or export the full inspection as JSON.",
    icon: FileText,
  },
];

export function WorkflowSteps() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
      {STEPS.map(({ title, description, icon: Icon }, index) => (
        <li key={title} className="flex flex-col gap-2 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-xs font-semibold text-amber-400 tabular-nums">
              {index + 1}
            </span>
            <Icon className="size-4 text-slate-500" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs leading-relaxed text-slate-500">{description}</p>
        </li>
      ))}
    </ol>
  );
}
