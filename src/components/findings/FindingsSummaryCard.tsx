"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { FINDING_STATUSES, INSPECTOR_PRIORITIES } from "@/lib/domain/constants";
import { summarizeFindings } from "@/lib/domain/finding";
import type { ID } from "@/lib/domain/types";
import { describeStorageError } from "@/lib/storage/errors";
import { listFindings } from "@/lib/storage/findings";
import { FindingStatusBadge, PriorityBadge } from "./FindingBadges";

/** Compact counts by status and priority for the inspection overview. */
export function FindingsSummaryCard({ inspectionId }: { inspectionId: ID }) {
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
          <Link href={`${base}/new`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
            <Plus aria-hidden="true" />
            New finding
          </Link>
        }
      />
      <CardBody className="space-y-4">
        {state.status === "loading" ? (
          <Skeleton className="h-16 w-full" />
        ) : state.status === "error" ? (
          <p className="text-sm text-red-700">{describeStorageError(state.error)}</p>
        ) : state.data.findings.length === 0 ? (
          <p className="text-sm text-slate-500">
            No findings recorded yet.
            {state.data.damaged.length > 0 ? ` ${state.data.damaged.length} damaged finding record(s) could not be read.` : ""}
          </p>
        ) : (
          (() => {
            const summary = summarizeFindings(state.data.findings);
            return (
              <>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    By status ({summary.total})
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {FINDING_STATUSES.map((status) => (
                      <li key={status} data-summary-status={status} className="flex items-center gap-1 text-sm">
                        <FindingStatusBadge status={status} />
                        <span className="font-semibold tabular-nums text-slate-900">{summary.byStatus[status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
                  <p className="text-xs text-amber-800">
                    {state.data.damaged.length} damaged finding record(s) could not be read; see the findings page.
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
