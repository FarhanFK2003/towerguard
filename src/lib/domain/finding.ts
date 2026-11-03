import { isIsoDateTime } from "@/lib/dates";
import { isAnnotation } from "./annotation";
import {
  DEFECT_CATEGORIES,
  ENGINEERING_SEVERITIES,
  FINDING_STATUSES,
  INSPECTOR_PRIORITIES,
  PROVENANCE_SOURCES,
  isOneOf,
  type DefectCategory,
  type FindingStatus,
  type InspectorPriority,
} from "./constants";
import { newId } from "./ids";
import { isPhotoRecord } from "./photo";
import type { EvidenceLink, Finding, ID, IsoDateTime } from "./types";
import type { FieldErrors, ValidationResult } from "./validation";

/** Inspector-editable finding fields (validated, normalised). */
export interface FindingFields {
  title: string;
  description: string;
  category: DefectCategory;
  inspectorPriority: InspectorPriority;
  status: FindingStatus;
  componentLocation?: string;
  recommendedAction?: string;
}

/** Raw form values as typed by the user. */
export interface FindingFormValues {
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  componentLocation: string;
  recommendedAction: string;
}

export type FindingField = keyof FindingFormValues;

export const FINDING_LIMITS = {
  title: 120,
  description: 4000,
  componentLocation: 200,
  recommendedAction: 2000,
} as const;

// ---- Form validation ------------------------------------------------------

/** Validates the finding form. Priority must be chosen explicitly; it is never derived from the category. */
export function validateFindingInput(values: FindingFormValues): ValidationResult<FindingFields, FindingField> {
  const errors: FieldErrors<FindingField> = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const componentLocation = values.componentLocation.trim();
  const recommendedAction = values.recommendedAction.trim();

  if (title === "") errors.title = "Title is required.";
  else if (title.length > FINDING_LIMITS.title) errors.title = `Title must be ${FINDING_LIMITS.title} characters or fewer.`;
  if (description === "") errors.description = "Description is required.";
  else if (description.length > FINDING_LIMITS.description) {
    errors.description = `Description must be ${FINDING_LIMITS.description} characters or fewer.`;
  }
  if (!isOneOf(DEFECT_CATEGORIES, values.category)) errors.category = "Select a category.";
  if (!isOneOf(INSPECTOR_PRIORITIES, values.priority)) errors.priority = "Select a priority.";
  if (!isOneOf(FINDING_STATUSES, values.status)) errors.status = "Select a status.";
  if (componentLocation.length > FINDING_LIMITS.componentLocation) {
    errors.componentLocation = `Component location must be ${FINDING_LIMITS.componentLocation} characters or fewer.`;
  }
  if (recommendedAction.length > FINDING_LIMITS.recommendedAction) {
    errors.recommendedAction = `Recommended action must be ${FINDING_LIMITS.recommendedAction} characters or fewer.`;
  }

  if (
    Object.keys(errors).length > 0 ||
    !isOneOf(DEFECT_CATEGORIES, values.category) ||
    !isOneOf(INSPECTOR_PRIORITIES, values.priority) ||
    !isOneOf(FINDING_STATUSES, values.status)
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      title,
      description,
      category: values.category,
      inspectorPriority: values.priority,
      status: values.status,
      componentLocation: componentLocation || undefined,
      recommendedAction: recommendedAction || undefined,
    },
  };
}

/** Form values for an existing finding (or blank defaults for a new one). */
export function findingToFormValues(finding?: Finding): FindingFormValues {
  return {
    title: finding?.title ?? "",
    description: finding?.description ?? "",
    category: finding?.category ?? "",
    priority: finding?.inspectorPriority ?? "",
    status: finding?.status ?? "observation",
    componentLocation: finding?.componentLocation ?? "",
    recommendedAction: finding?.recommendedAction ?? "",
  };
}

// ---- Evidence -------------------------------------------------------------

/** Merges repeated photographs and drops repeated annotation IDs, keeping first-seen order. */
export function normalizeEvidence(evidence: readonly EvidenceLink[]): EvidenceLink[] {
  const result: EvidenceLink[] = [];
  const seenAnnotations = new Set<ID>();
  for (const link of evidence) {
    let target = result.find((l) => l.photoId === link.photoId);
    if (!target) {
      target = { photoId: link.photoId, annotationIds: [] };
      result.push(target);
    }
    for (const id of link.annotationIds) {
      if (!seenAnnotations.has(id)) {
        seenAnnotations.add(id);
        target.annotationIds.push(id);
      }
    }
  }
  return result;
}

/** Structural problems in stored evidence (malformed or duplicate references). */
export function findEvidenceProblem(evidence: unknown): string | undefined {
  if (!Array.isArray(evidence)) return "Evidence must be a list.";
  const photos = new Set<string>();
  const annotations = new Set<string>();
  for (const link of evidence as unknown[]) {
    if (typeof link !== "object" || link === null) return "Evidence references are malformed.";
    const { photoId, annotationIds } = link as Record<string, unknown>;
    if (typeof photoId !== "string" || photoId === "" || !Array.isArray(annotationIds)) {
      return "Evidence references are malformed.";
    }
    if (photos.has(photoId)) return "A photograph is attached more than once.";
    photos.add(photoId);
    for (const id of annotationIds as unknown[]) {
      if (typeof id !== "string" || id === "") return "Evidence references are malformed.";
      if (annotations.has(id)) return "An annotation is linked more than once.";
      annotations.add(id);
    }
  }
  return undefined;
}

/**
 * Checks that every referenced photograph and annotation exists and belongs to
 * the finding's inspection (and each annotation to the photograph it is listed
 * under). `photos`/`annotations` hold the stored records by ID.
 */
export function checkEvidenceRelations(
  inspectionId: ID,
  evidence: readonly EvidenceLink[],
  records: { photos: ReadonlyMap<ID, unknown>; annotations: ReadonlyMap<ID, unknown> },
): string | undefined {
  for (const link of evidence) {
    const photo = records.photos.get(link.photoId);
    if (!isPhotoRecord(photo)) return "A linked photograph does not exist.";
    if (photo.inspectionId !== inspectionId) return "A linked photograph belongs to a different inspection.";
    for (const id of link.annotationIds) {
      const annotation = records.annotations.get(id);
      if (!isAnnotation(annotation)) return "A linked annotation does not exist.";
      if (annotation.inspectionId !== inspectionId) return "A linked annotation belongs to a different inspection.";
      if (annotation.photoId !== link.photoId) return "A linked annotation is not on the photograph it is listed under.";
    }
  }
  return undefined;
}

export function attachPhoto(evidence: readonly EvidenceLink[], photoId: ID): EvidenceLink[] {
  return evidence.some((l) => l.photoId === photoId) ? [...evidence] : [...evidence, { photoId, annotationIds: [] }];
}

/** Removes a photograph and its annotation links. The photograph itself is not touched. */
export function detachPhoto(evidence: readonly EvidenceLink[], photoId: ID): EvidenceLink[] {
  return evidence.filter((l) => l.photoId !== photoId);
}

/** Links or unlinks an annotation, attaching its photograph first if needed. */
export function toggleAnnotation(evidence: readonly EvidenceLink[], photoId: ID, annotationId: ID): EvidenceLink[] {
  const withPhoto = attachPhoto(evidence, photoId);
  return withPhoto.map((l) => {
    if (l.photoId !== photoId) return l;
    const linked = l.annotationIds.includes(annotationId);
    return {
      photoId,
      annotationIds: linked ? l.annotationIds.filter((id) => id !== annotationId) : [...l.annotationIds, annotationId],
    };
  });
}

/** Removes one annotation from every link; the photograph links stay. */
export function detachAnnotation(evidence: readonly EvidenceLink[], annotationId: ID): EvidenceLink[] {
  return evidence.map((l) => ({ photoId: l.photoId, annotationIds: l.annotationIds.filter((id) => id !== annotationId) }));
}

export function evidenceCounts(evidence: readonly EvidenceLink[]): { photos: number; annotations: number } {
  return {
    photos: evidence.length,
    annotations: evidence.reduce((sum, l) => sum + l.annotationIds.length, 0),
  };
}

// ---- Records --------------------------------------------------------------

export interface FindingContext {
  inspectionId: ID;
  /** Inspector recording the finding (provenance and review attribution). */
  recordedBy: string;
}

/** Builds a manually entered finding. Engineering severity always starts as not assessed. */
export function createFindingRecord(
  fields: FindingFields,
  evidence: readonly EvidenceLink[],
  context: FindingContext,
  options: { id?: ID; now?: Date } = {},
): Finding {
  const timestamp = (options.now ?? new Date()).toISOString();
  const record: Finding = {
    id: options.id ?? newId(),
    inspectionId: context.inspectionId,
    title: fields.title,
    description: fields.description,
    category: fields.category,
    inspectorPriority: fields.inspectorPriority,
    engineeringSeverity: "not_assessed",
    status: fields.status,
    evidence: normalizeEvidence(evidence),
    provenance: { source: "manual", recordedBy: context.recordedBy, recordedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (fields.componentLocation !== undefined) record.componentLocation = fields.componentLocation;
  if (fields.recommendedAction !== undefined) record.recommendedAction = fields.recommendedAction;
  if (fields.status !== "observation") record.review = { reviewedBy: context.recordedBy, reviewedAt: timestamp };
  return record;
}

export interface FindingChanges {
  fields?: FindingFields;
  evidence?: readonly EvidenceLink[];
}

/**
 * Timestamp for any change to an existing finding: `now`, but never earlier
 * than 1 ms after its previous `updatedAt` or last review. This keeps
 * "edited after review" detectable even when an edit lands in the same
 * millisecond as the review or the device clock moves backwards.
 */
export function changeTimestamp(existing: Finding, now: Date): IsoDateTime {
  const previous = Math.max(
    Date.parse(existing.updatedAt),
    existing.review ? Date.parse(existing.review.reviewedAt) : Number.NEGATIVE_INFINITY,
  );
  return new Date(Number.isNaN(previous) ? now.getTime() : Math.max(now.getTime(), previous + 1)).toISOString();
}

/**
 * Applies edits. A status change to confirmed/dismissed records who reviewed it
 * and when; returning to observation clears the review. IDs, provenance,
 * createdAt and engineering severity never change here.
 */
export function applyFindingChanges(
  existing: Finding,
  changes: FindingChanges,
  reviewer: string,
  now: Date = new Date(),
): Finding {
  const timestamp = changeTimestamp(existing, now);
  const next: Finding = { ...existing, updatedAt: timestamp };
  const { fields, evidence } = changes;
  if (fields) {
    next.title = fields.title;
    next.description = fields.description;
    next.category = fields.category;
    next.inspectorPriority = fields.inspectorPriority;
    if (fields.componentLocation === undefined) delete next.componentLocation;
    else next.componentLocation = fields.componentLocation;
    if (fields.recommendedAction === undefined) delete next.recommendedAction;
    else next.recommendedAction = fields.recommendedAction;
    if (fields.status !== existing.status) {
      next.status = fields.status;
      if (fields.status === "observation") delete next.review;
      else next.review = { reviewedBy: reviewer, reviewedAt: timestamp };
    }
  }
  if (evidence) next.evidence = normalizeEvidence(evidence);
  return next;
}

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";
const isTimestamp = (value: unknown) => typeof value === "string" && isIsoDateTime(value);

/** Runtime guard for findings read from storage. */
export function isFinding(value: unknown): value is Finding {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const provenance = r.provenance as Record<string, unknown> | null | undefined;
  const review = r.review as Record<string, unknown> | null | undefined;
  return (
    isNonEmptyString(r.id) &&
    isNonEmptyString(r.inspectionId) &&
    isNonEmptyString(r.title) &&
    isNonEmptyString(r.description) &&
    isOneOf(DEFECT_CATEGORIES, r.category) &&
    isOneOf(INSPECTOR_PRIORITIES, r.inspectorPriority) &&
    isOneOf(ENGINEERING_SEVERITIES, r.engineeringSeverity) &&
    isOptionalString(r.engineeringReference) &&
    isOneOf(FINDING_STATUSES, r.status) &&
    isOptionalString(r.componentLocation) &&
    isOptionalString(r.recommendedAction) &&
    findEvidenceProblem(r.evidence) === undefined &&
    typeof provenance === "object" &&
    provenance !== null &&
    isOneOf(PROVENANCE_SOURCES, provenance.source) &&
    isNonEmptyString(provenance.recordedBy) &&
    isTimestamp(provenance.recordedAt) &&
    (review === undefined ||
      (typeof review === "object" &&
        review !== null &&
        isNonEmptyString(review.reviewedBy) &&
        isTimestamp(review.reviewedAt) &&
        (review.note === undefined ||
          (isNonEmptyString(review.note) && review.note.length <= REVIEW_NOTE_LIMIT)))) &&
    isTimestamp(r.createdAt) &&
    isTimestamp(r.updatedAt)
  );
}

// ---- Review ---------------------------------------------------------------
//
// Reviewing is an explicit act, separate from editing. The review timestamp
// and `updatedAt` are written with the same value, so a finding is "edited
// after review" exactly when `updatedAt` is later than `review.reviewedAt`.

export const REVIEW_NOTE_LIMIT = 1000;

/** `return` puts the finding back to observation and clears the review. */
export const REVIEW_DECISIONS = ["confirm", "dismiss", "return"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface ReviewInput {
  decision: ReviewDecision;
  /** Trimmed; required when dismissing, optional when confirming, ignored on return. */
  note?: string;
}

/** Validates a review action. Dismissing requires a reason. */
export function validateReviewInput(input: { decision: string; note: string }): { ok: true; value: ReviewInput } | { ok: false; error: string } {
  if (!isOneOf(REVIEW_DECISIONS, input.decision)) return { ok: false, error: "Choose a valid review action." };
  const note = input.note.trim();
  if (input.decision === "return") return { ok: true, value: { decision: "return" } };
  if (note.length > REVIEW_NOTE_LIMIT) {
    return { ok: false, error: `The review note must be ${REVIEW_NOTE_LIMIT} characters or fewer.` };
  }
  if (input.decision === "dismiss" && note === "") {
    return { ok: false, error: "A reason is required to dismiss a finding." };
  }
  return { ok: true, value: note ? { decision: input.decision, note } : { decision: input.decision } };
}

/**
 * Applies a validated review decision. Only status, review and `updatedAt`
 * change; `review.reviewedAt` and `updatedAt` share one timestamp so a fresh
 * review is never "edited after review".
 */
export function applyReviewDecision(existing: Finding, review: ReviewInput, reviewer: string, now: Date = new Date()): Finding {
  const timestamp = changeTimestamp(existing, now);
  const next: Finding = { ...existing, updatedAt: timestamp };
  if (review.decision === "return") {
    next.status = "observation";
    delete next.review;
    return next;
  }
  next.status = review.decision === "confirm" ? "confirmed" : "dismissed";
  next.review = { reviewedBy: reviewer, reviewedAt: timestamp };
  if (review.note) next.review.note = review.note;
  return next;
}

/**
 * - `unreviewed`: still an observation.
 * - `incomplete`: confirmed/dismissed without usable review metadata (or a dismissal without a reason).
 * - `stale`: changed after its last review (data or evidence).
 * - `current`: reviewed, and unchanged since.
 */
export type ReviewState = "unreviewed" | "incomplete" | "stale" | "current";

export function reviewState(finding: Finding): ReviewState {
  if (finding.status === "observation") return "unreviewed";
  const review = finding.review;
  if (!review) return "incomplete";
  if (finding.status === "dismissed" && !review.note?.trim()) return "incomplete";
  const reviewedAt = Date.parse(review.reviewedAt);
  const updatedAt = Date.parse(finding.updatedAt);
  if (Number.isNaN(reviewedAt) || Number.isNaN(updatedAt)) return "incomplete";
  return updatedAt > reviewedAt ? "stale" : "current";
}

export const needsReview = (finding: Finding): boolean => reviewState(finding) !== "current";

/** True when a reviewed finding has changed since (shown as "Edited after review"). */
export const isEditedAfterReview = (finding: Finding): boolean => reviewState(finding) === "stale";

/** The first finding needing review in list order, skipping `currentId`. */
export function nextFindingNeedingReview(findings: readonly Finding[], currentId?: ID): Finding | undefined {
  return findings.find((f) => f.id !== currentId && needsReview(f));
}

export interface ReviewCounts {
  total: number;
  /** Observations not yet reviewed. */
  unreviewed: number;
  /** Confirmed with a current review. */
  confirmed: number;
  /** Dismissed with a current review. */
  dismissed: number;
  /** Reviewed but changed since, or missing review metadata. */
  outOfDate: number;
}

export function reviewCounts(findings: readonly Finding[]): ReviewCounts {
  const counts: ReviewCounts = { total: findings.length, unreviewed: 0, confirmed: 0, dismissed: 0, outOfDate: 0 };
  for (const f of findings) {
    const state = reviewState(f);
    if (state === "unreviewed") counts.unreviewed += 1;
    else if (state !== "current") counts.outOfDate += 1;
    else if (f.status === "confirmed") counts.confirmed += 1;
    else counts.dismissed += 1;
  }
  return counts;
}

// ---- Lists ----------------------------------------------------------------

export interface FindingFilters {
  category?: DefectCategory;
  priority?: InspectorPriority;
  status?: FindingStatus;
  /** Only findings that are unreviewed, out of date or missing review metadata. */
  needsReview?: boolean;
}

export function filterFindings(findings: readonly Finding[], filters: FindingFilters): Finding[] {
  return findings.filter(
    (f) =>
      (!filters.category || f.category === filters.category) &&
      (!filters.priority || f.inspectorPriority === filters.priority) &&
      (!filters.status || f.status === filters.status) &&
      (!filters.needsReview || needsReview(f)),
  );
}

export interface FindingSummary {
  total: number;
  byStatus: Record<FindingStatus, number>;
  /** Priority counts exclude dismissed findings. */
  byPriority: Record<InspectorPriority, number>;
}

export function summarizeFindings(findings: readonly Finding[]): FindingSummary {
  const byStatus = { observation: 0, confirmed: 0, dismissed: 0 } satisfies Record<FindingStatus, number>;
  const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 } satisfies Record<InspectorPriority, number>;
  for (const f of findings) {
    byStatus[f.status] += 1;
    if (f.status !== "dismissed") byPriority[f.inspectorPriority] += 1;
  }
  return { total: findings.length, byStatus, byPriority };
}
