"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleSlash, ClipboardCheck, LoaderCircle, Undo2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Textarea } from "@/components/ui/Field";
import { REVIEW_NOTE_LIMIT, reviewState, validateReviewInput, type ReviewDecision } from "@/lib/domain/finding";
import type { Finding } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/format";
import { describeStorageError } from "@/lib/storage/errors";
import { reviewFinding } from "@/lib/storage/findings";
import { FindingStatusBadge, STATUS_EXPLANATIONS } from "./FindingBadges";

export const STALE_REVIEW_MESSAGE = "Edited after review. This finding needs to be reviewed again.";

/**
 * Review actions, separate from editing: confirm (optional note), dismiss
 * (reason required) or return to observation. Reviewing records the
 * inspector's decision; it is not an engineering certification.
 */
export function FindingReviewPanel({
  finding,
  reviewer,
  readOnly,
  hasUnsavedEdits,
  nextHref,
  onReviewed,
}: {
  finding: Finding;
  reviewer: string;
  readOnly: boolean;
  hasUnsavedEdits: boolean;
  /** Link to the next finding needing review, if any. */
  nextHref?: string;
  onReviewed: (updated: Finding) => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [saved, setSaved] = useState(false);

  const state = reviewState(finding);
  const disabled = readOnly || hasUnsavedEdits || busy !== null;

  async function act(decision: ReviewDecision) {
    setError(null);
    setSaved(false);
    const validated = validateReviewInput({ decision, note });
    if (!validated.ok) {
      setError(validated.error);
      document.getElementById("review-note")?.focus();
      return;
    }
    setBusy(decision);
    try {
      const updated = await reviewFinding(finding.id, { decision, note }, reviewer);
      setNote("");
      setSaved(true);
      onReviewed(updated);
    } catch (err) {
      setError(describeStorageError(err));
    } finally {
      setBusy(null);
    }
  }

  const spinner = (decision: ReviewDecision) =>
    busy === decision ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null;

  return (
    <Card id="finding-review" tabIndex={-1} data-testid="finding-review-panel" data-review-state={state} className="outline-none">
      <CardHeader title="Review" description="Your decision on this observation." icon={<ClipboardCheck />} />
      <CardBody className="space-y-4">
        <div className="space-y-1.5 text-sm">
          <FindingStatusBadge status={finding.status} />
          <p className="text-slate-600">{STATUS_EXPLANATIONS[finding.status]}</p>
        </div>

        {state === "stale" ? (
          <Callout tone="warning" title={STALE_REVIEW_MESSAGE}>
            It was changed after the last review.
          </Callout>
        ) : state === "incomplete" ? (
          <Callout tone="warning" title="Review details are incomplete">
            {finding.status === "dismissed" ? "A dismissal needs a recorded reason." : "No review is recorded."} Review it
            again.
          </Callout>
        ) : null}

        {finding.review ? (
          <dl className="space-y-2 rounded-md bg-slate-50 p-3 text-sm" data-testid="review-details">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {state === "stale" ? "Last review (out of date)" : "Reviewed"}
              </dt>
              <dd>
                by {finding.review.reviewedBy}, {formatTimestamp(finding.review.reviewedAt)}
              </dd>
            </div>
            {finding.review.note ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {finding.status === "dismissed" ? "Reason" : "Note"}
                </dt>
                <dd className="whitespace-pre-wrap" data-testid="review-note-saved">
                  {finding.review.note}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {readOnly ? (
          <p className="text-sm text-slate-500">Review actions are unavailable while the inspection is finalised.</p>
        ) : (
          <>
            {hasUnsavedEdits ? (
              <p className="text-sm text-amber-800">Save or discard your edits before reviewing.</p>
            ) : null}
            <Field
              id="review-note"
              label="Review note"
              hint="Required when dismissing (the reason); optional when confirming."
              error={error ?? undefined}
            >
              <Textarea
                id="review-note"
                value={note}
                rows={3}
                className="min-h-20"
                maxLength={REVIEW_NOTE_LIMIT}
                invalid={Boolean(error)}
                aria-describedby={error ? "review-note-error" : "review-note-hint"}
                disabled={disabled}
                onChange={(e) => {
                  setNote(e.target.value);
                  setError(null);
                  setSaved(false);
                }}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={disabled} onClick={() => act("confirm")}>
                {spinner("confirm") ?? <CircleCheck aria-hidden="true" />}
                {finding.status === "confirmed" ? "Confirm again" : "Confirm finding"}
              </Button>
              <Button size="sm" variant="secondary" disabled={disabled} onClick={() => act("dismiss")}>
                {spinner("dismiss") ?? <CircleSlash aria-hidden="true" />}
                {finding.status === "dismissed" ? "Dismiss again" : "Dismiss finding"}
              </Button>
              {finding.status !== "observation" ? (
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => act("return")}>
                  {spinner("return") ?? <Undo2 aria-hidden="true" />}
                  Return to observation
                </Button>
              ) : null}
            </div>
          </>
        )}

        {saved ? (
          <p className="inline-flex items-center gap-1 text-sm text-emerald-700" role="status">
            <CircleCheck className="size-4" aria-hidden="true" />
            Review saved
          </p>
        ) : null}

        {nextHref ? (
          <Link href={nextHref} className={buttonClasses({ variant: "secondary", size: "sm", className: "w-full" })} data-testid="next-needing-review">
            Next finding needing review
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <p className="text-xs text-slate-500">No other findings need review.</p>
        )}
      </CardBody>
    </Card>
  );
}
