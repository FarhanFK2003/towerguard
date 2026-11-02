import Link from "next/link";
import { CalendarDays, ChevronRight, RadioTower, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { STRUCTURE_TYPE_LABELS } from "@/lib/domain/constants";
import type { Inspection } from "@/lib/domain/types";
import { formatIsoDate } from "@/lib/format";
import { InspectionStatusBadge } from "./InspectionStatusBadge";

export function InspectionList({ inspections }: { inspections: readonly Inspection[] }) {
  return (
    <ul className="divide-y divide-slate-200">
      {inspections.map((inspection) => (
        <li key={inspection.id}>
          <Link
            href={`/inspections/${inspection.id}`}
            className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-500"
          >
            <span
              className="hidden size-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 sm:flex"
              aria-hidden="true"
            >
              <RadioTower className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="truncate text-sm font-semibold text-slate-900">{inspection.siteName}</p>
                <p className="font-mono text-xs text-slate-500">{inspection.siteId}</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>{STRUCTURE_TYPE_LABELS[inspection.structureType]}</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Inspection date:</span>
                  {formatIsoDate(inspection.inspectionDate)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Inspector:</span>
                  {inspection.inspectorName}
                </span>
              </div>
            </div>
            <InspectionStatusBadge status={inspection.status} />
            <ChevronRight
              className="size-4 shrink-0 text-slate-400 group-hover:text-slate-600"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function InspectionListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-200" aria-busy="true" aria-label="Loading inspections">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="hidden size-10 rounded-md sm:block" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
