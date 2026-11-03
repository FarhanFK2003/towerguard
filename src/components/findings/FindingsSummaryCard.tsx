"use client";

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { CircleCheck, CircleSlash, Clock, ListChecks, Plus, TriangleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { INSPECTOR_PRIORITIES } from "@/lib/domain/constants";
import { reviewCounts, summarizeFindings, type ReviewCounts } from "@/lib/domain/finding";
import type { ID } from "@/lib/domain/types";
import { describeStorageError } from "@/lib/storage/errors";
import { listFindings } from "@/lib/storage/findings";
import { PriorityBadge } from "./FindingBadges";

const REVIEW_TILES: readonly { key: keyof ReviewCounts; label: string; icon: ReactNode }[] = [
  { key: "unreviewed", label: "Observations needing review", icon: <Clock className="text-sky-600" /> },
  { key: "confirmed", label: "Confirmed", icon: <CircleCheck className="text-emerald-600" /> },
  { key: "dismissed", label: "Dismissed", icon: <CircleSlash className="text-slate-500" /> },
  { key: "outOfDate", label: "Out-of-date reviews", icon: <TriangleAlert className="text-amber-600" /> },
];

/** Review counts and priorities for the inspection overview (from stored findings). */
export function FindingsSummaryCard({ inspectionId, readOnly = false }: { inspectionId: ID; readOnly?: boolean }) {
  const load = useCallback(() => listFindings(inspectionId), [inspectionId]);
  const { state } = useAsyncData(load);
  const base = `/inspections/${inspectionId}/findings`;

  return (
    <Card data-testid="findings-summary">
      <CardHeader
        title="Findings"
        description="Recorded and reviewed by the inspector."
        icon={<ListChecks />}
        action={
          readOnly ? undefined : (
            <Link href={`${base}/new`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
              <Plus aria-hidden="true" />
              New finding
            </Link>
          )
        }
      />
      <CardBody className="space-y-4">
        {state.status === "loading" ? (
          <Skeleton className="h-16 w-full" />
        ) : state.status === "error" ? (
          <p className="text-sm text-red-700">{describeStorageError(state.error)}</p>
        ) : state.data.findings.length === 0 && state.data.damaged.length === 0 ? (
          <p className="text-sm text-slate-500">No findings recorded yet.</p>
        ) : (
          (() => {
            const counts = reviewCounts(state.data.findings);
            const summary = summarizeFindings(state.data.findings);
            return (
              <>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold tabular-nums text-slate-900" data-summary-review="total">
                    {counts.total}
                  </span>{" "}
                  finding{counts.total === 1 ? "" : "s"}
                </p>
                <dl className="grid grid-cols-2 gap-2">
                  {REVIEW_TILES.map(({ key, label, icon }) => (
                    <div key={key} className="rounded-md border border-slate-200 px-2.5 py-2">
                      <dt className="flex items-center gap-1 text-xs text-slate-500 [&_svg]:size-3.5">
                        {icon}
                        {label}
                      </dt>
                      <dd className="text-lg font-semibold tabular-nums text-slate-900" data-summary-review={key}>
                        {counts[key]}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    By priority (excluding dismissed)
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {[...INSPECTOR_PRIORITIES].reverse().map((priority) => (
                      <li key={priority} data-summary-priority={priority} className="flex items-center gap-1 text-sm">
                        <PriorityBadge priority={priority} />
                        <span className="font-semibold tabular-nums text-slate-900">{summary.byPriority[priority]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {state.data.damaged.length > 0 ? (
                  <p className="text-xs text-amber-800" data-summary-review="damaged">
                    {state.data.damaged.length} damaged finding record(s) could not be read and are not counted above;
                    see the findings page.
                  </p>
                ) : null}
              </>
            );
          })()
        )}
        <Link href={base} className="inline-block text-sm font-medium text-amber-700 hover:text-amber-900 hover:underline">
          View all findings →
        </Link>
      </CardBody>
    </Card>
  );
}
