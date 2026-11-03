import { reviewState } from "./finding";
import type { Finding, ID } from "./types";

/**
 * Whether an inspection's documentation is ready to finalise. Finalising
 * records that the inspector completed the documentation; nothing here says
 * anything about structural safety.
 */

export type ReadinessCode =
  | "unreviewed_findings"
  | "out_of_date_reviews"
  | "damaged_findings"
  | "no_findings"
  | "confirmed_without_evidence";

export interface ReadinessIssue {
  code: ReadinessCode;
  message: string;
  count: number;
  /** Affected findings, where they can be identified. */
  findingIds: ID[];
}

export interface Readiness {
  /** Issues that prevent finalisation. */
  blockers: ReadinessIssue[];
  /** Issues the inspector must explicitly acknowledge before finalising. */
  warnings: ReadinessIssue[];
  requiresAcknowledgement: boolean;
  /** No blockers (warnings may still need acknowledgement). */
  blocked: boolean;
  /** Findings with a current review, out of all valid findings. */
  reviewed: number;
  total: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Assesses readiness from valid findings plus the number of damaged finding records. */
export function assessReadiness(findings: readonly Finding[], damagedCount: number): Readiness {
  const unreviewed = findings.filter((f) => reviewState(f) === "unreviewed");
  const outOfDate = findings.filter((f) => {
    const state = reviewState(f);
    return state === "stale" || state === "incomplete";
  });
  const confirmedWithoutEvidence = findings.filter((f) => f.status === "confirmed" && f.evidence.length === 0);

  const blockers: ReadinessIssue[] = [];
  if (unreviewed.length > 0) {
    blockers.push({
      code: "unreviewed_findings",
      message: `${plural(unreviewed.length, "finding has", "findings have")} not been reviewed yet.`,
      count: unreviewed.length,
      findingIds: unreviewed.map((f) => f.id),
    });
  }
  if (outOfDate.length > 0) {
    blockers.push({
      code: "out_of_date_reviews",
      message: `${plural(outOfDate.length, "finding was", "findings were")} changed after review or ${outOfDate.length === 1 ? "has" : "have"} incomplete review details, and must be reviewed again.`,
      count: outOfDate.length,
      findingIds: outOfDate.map((f) => f.id),
    });
  }
  if (damagedCount > 0) {
    blockers.push({
      code: "damaged_findings",
      message: `${plural(damagedCount, "finding record is", "finding records are")} damaged and cannot be checked.`,
      count: damagedCount,
      findingIds: [],
    });
  }

  const warnings: ReadinessIssue[] = [];
  if (findings.length === 0 && damagedCount === 0) {
    warnings.push({ code: "no_findings", message: "This inspection has no findings.", count: 0, findingIds: [] });
  }
  if (confirmedWithoutEvidence.length > 0) {
    warnings.push({
      code: "confirmed_without_evidence",
      message: `${plural(confirmedWithoutEvidence.length, "confirmed finding has", "confirmed findings have")} no linked photographic evidence.`,
      count: confirmedWithoutEvidence.length,
      findingIds: confirmedWithoutEvidence.map((f) => f.id),
    });
  }

  return {
    blockers,
    warnings,
    requiresAcknowledgement: warnings.length > 0,
    blocked: blockers.length > 0,
    reviewed: findings.filter((f) => reviewState(f) === "current").length,
    total: findings.length,
  };
}

/** Finalisation is allowed with no blockers and, if there are warnings, an explicit acknowledgement. */
export function canFinalise(readiness: Readiness, warningsAcknowledged: boolean): boolean {
  return !readiness.blocked && (!readiness.requiresAcknowledgement || warningsAcknowledged);
}
