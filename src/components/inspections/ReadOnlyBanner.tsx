import Link from "next/link";
import { Lock } from "lucide-react";
import type { Inspection } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/format";

/** Shown on every page of a finalised inspection. Finalised ≠ structurally assessed. */
export function ReadOnlyBanner({ inspection, showReopenLink = true }: { inspection: Inspection; showReopenLink?: boolean }) {
  if (inspection.status !== "finalised") return null;
  return (
    <div
      role="status"
      data-testid="read-only-banner"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-300 bg-slate-900 px-4 py-3 text-sm text-slate-100"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p className="font-semibold">Finalised (read-only)</p>
        <p className="text-slate-300">
          {inspection.finalisation
            ? `Documentation completed by ${inspection.finalisation.finalisedBy}, ${formatTimestamp(inspection.finalisation.finalisedAt)}. `
            : null}
          Photographs, annotations and findings cannot be changed. This is not a structural safety or engineering
          assessment.
        </p>
      </div>
      {showReopenLink ? (
        <Link
          href={`/inspections/${inspection.id}`}
          className="shrink-0 rounded font-medium text-amber-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Reopen on the inspection page
        </Link>
      ) : null}
    </div>
  );
}
