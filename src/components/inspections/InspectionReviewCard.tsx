"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, ClipboardCheck, LoaderCircle, Lock, LockOpen, Play, TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { nextFindingNeedingReview } from "@/lib/domain/finding";
import { assessReadiness, canFinalise } from "@/lib/domain/readiness";
import type { Inspection } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/format";
import { describeStorageError } from "@/lib/storage/errors";
import { listFindings } from "@/lib/storage/findings";
import { finaliseInspection, reopenInspection, startInspectionReview } from "@/lib/storage/inspections";
import { InspectionStatusBadge } from "./InspectionStatusBadge";

const DISCLAIMER =
  "Finalising records that you have completed the inspection documentation. It does not certify structural safety and is not an engineering assessment.";

/**
 * Inspection review lifecycle: start review, readiness checklist, finalise,
 * reopen. Key it by `inspection.updatedAt` so it re-reads the findings after
 * every status change (it also re-reads when a cached page becomes visible).
 */
export function InspectionReviewCard({ inspection, onChanged }: { inspection: Inspection; onChanged: () => void }) {
  const load = useCallback(() => listFindings(inspection.id), [inspection.id]);
  const { state } = useAsyncData(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setAcknowledged(false);
      onChanged();
    } catch (err) {
      setError(describeStorageError(err));
    } finally {
      setBusy(false);
    }
  }

  const findingsBase = `/inspections/${inspection.id}/findings`;

  return (
    <Card data-testid="inspection-review-card" data-inspection-status={inspection.status}>
      <CardHeader title="Review & finalisation" icon={<ClipboardCheck />} />
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Status:</span>
          <InspectionStatusBadge status={inspection.status} />
        </div>
        {error ? (
          <Callout tone="danger" title="The status could not be changed">
            {error}
          </Callout>
        ) : null}

        {inspection.status === "draft" ? (
          <>
            <p className="text-sm text-slate-600">
              Start review when fieldwork is complete. The inspection stays editable while you review the findings.
            </p>
            <Button size="sm" disabled={busy} onClick={() => run(() => startInspectionReview(inspection.id))}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
              Start review
            </Button>
          </>
        ) : inspection.status === "finalised" ? (
          <>
            <p className="flex items-start gap-2 text-sm font-medium text-slate-900">
              <Lock className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden="true" />
              Finalised (read-only)
            </p>
            {inspection.finalisation ? (
              <p className="text-sm text-slate-600" data-testid="finalisation-details">
                by {inspection.finalisation.finalisedBy}, {formatTimestamp(inspection.finalisation.finalisedAt)}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">{DISCLAIMER}</p>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmReopen(true)}>
              <LockOpen aria-hidden="true" />
              Reopen inspection
            </Button>
            <ConfirmDialog
              open={confirmReopen}
              title="Reopen this inspection?"
              description="The inspection returns to review and becomes editable again. The finalisation record is cleared; you will need to finalise it again when the documentation is complete."
              confirmLabel={busy ? "Reopening…" : "Reopen inspection"}
              busy={busy}
              onConfirm={() =>
                run(async () => {
                  await reopenInspection(inspection.id);
                  setConfirmReopen(false);
                })
              }
              onCancel={() => setConfirmReopen(false)}
            />
          </>
        ) : state.status === "loading" ? (
          <Skeleton className="h-24 w-full" />
        ) : state.status === "error" ? (
          <p className="text-sm text-red-700">{describeStorageError(state.error)}</p>
        ) : (
          (() => {
            const readiness = assessReadiness(state.data.findings, state.data.damaged.length);
            const next = nextFindingNeedingReview(state.data.findings);
            const allowed = canFinalise(readiness, acknowledged);
            return (
              <>
                <div>
                  <p className="text-sm text-slate-700" data-testid="review-progress">
                    {readiness.reviewed} of {readiness.total} finding{readiness.total === 1 ? "" : "s"} reviewed
                  </p>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${readiness.total ? (readiness.reviewed / readiness.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {readiness.blockers.length > 0 ? (
                  <div data-testid="readiness-blockers">
                    <p className="mb-1 text-sm font-semibold text-red-800">Cannot finalise yet</p>
                    <ul className="space-y-1">
                      {readiness.blockers.map((b) => (
                        <li key={b.code} data-blocker={b.code} className="flex items-start gap-1.5 text-sm text-red-800">
                          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          {b.message}
                        </li>
                      ))}
                    </ul>
                    {next ? (
                      <Link href={`${findingsBase}/${next.id}`} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-2" })}>
                        Review next finding
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <p className="flex items-start gap-1.5 text-sm text-emerald-700">
                    <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    All findings have a current review.
                  </p>
                )}

                {readiness.warnings.length > 0 ? (
                  <div data-testid="readiness-warnings" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                    <ul className="space-y-1">
                      {readiness.warnings.map((w) => (
                        <li key={w.code} data-warning={w.code} className="flex items-start gap-1.5 text-sm text-amber-900">
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          {w.message}
                        </li>
                      ))}
                    </ul>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-amber-950">
                      <input
                        type="checkbox"
                        data-testid="acknowledge-warnings"
                        checked={acknowledged}
                        disabled={busy || readiness.blocked}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5 size-4 accent-amber-600"
                      />
                      I acknowledge these documentation warnings and want to finalise this inspection.
                    </label>
                  </div>
                ) : null}

                <p className="text-xs text-slate-500">{DISCLAIMER}</p>
                <Button
                  size="sm"
                  disabled={busy || !allowed}
                  onClick={() => run(() => finaliseInspection(inspection.id, { acknowledgeWarnings: acknowledged }))}
                >
                  {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}
                  Finalise inspection
                </Button>
                {!allowed ? (
                  <p className="text-xs text-slate-500" data-testid="finalise-reason">
                    {readiness.blocked
                      ? "Resolve the issues above to finalise."
                      : "Acknowledge the warnings to finalise."}
                  </p>
                ) : null}
              </>
            );
          })()
        )}
      </CardBody>
    </Card>
  );
}
