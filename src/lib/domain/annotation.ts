import { isValidShape } from "@/lib/annotations/geometry";
import { isIsoDateTime } from "@/lib/dates";
import { ANNOTATION_LABELS, PROVENANCE_SOURCES, isOneOf, type AnnotationLabel } from "./constants";
import { newId } from "./ids";
import type { Annotation, AnnotationShape, ID } from "./types";

export interface AnnotationInput {
  inspectionId: ID;
  photoId: ID;
  shape: AnnotationShape;
  label?: AnnotationLabel;
  /** The inspector recording the annotation. */
  recordedBy: string;
}

/** A partial update. `label: undefined` (present) clears the label. */
export interface AnnotationPatch {
  shape?: AnnotationShape;
  label?: AnnotationLabel;
}

/** Builds a manually entered annotation. `id` and `now` are injectable for tests. */
export function createAnnotationRecord(input: AnnotationInput, options: { id?: ID; now?: Date } = {}): Annotation {
  const timestamp = (options.now ?? new Date()).toISOString();
  const record: Annotation = {
    id: options.id ?? newId(),
    inspectionId: input.inspectionId,
    photoId: input.photoId,
    shape: input.shape,
    provenance: { source: "manual", recordedBy: input.recordedBy, recordedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (input.label !== undefined) record.label = input.label;
  return record;
}

/** Applies a shape and/or label change. IDs, provenance and createdAt never change. */
export function applyAnnotationPatch(existing: Annotation, patch: AnnotationPatch, now: Date = new Date()): Annotation {
  const next: Annotation = { ...existing, updatedAt: now.toISOString() };
  if (patch.shape !== undefined) next.shape = patch.shape;
  if (Object.hasOwn(patch, "label")) {
    if (patch.label === undefined) delete next.label;
    else next.label = patch.label;
  }
  return next;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Runtime guard for annotations read from storage. */
export function isAnnotation(value: unknown): value is Annotation {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  const provenance = r.provenance as Record<string, unknown> | null | undefined;
  return (
    isNonEmptyString(r.id) &&
    isNonEmptyString(r.inspectionId) &&
    isNonEmptyString(r.photoId) &&
    isValidShape(r.shape) &&
    (r.label === undefined || isOneOf(ANNOTATION_LABELS, r.label)) &&
    typeof provenance === "object" &&
    provenance !== null &&
    isOneOf(PROVENANCE_SOURCES, provenance.source) &&
    isNonEmptyString(provenance.recordedBy) &&
    typeof provenance.recordedAt === "string" &&
    isIsoDateTime(provenance.recordedAt) &&
    typeof r.createdAt === "string" &&
    isIsoDateTime(r.createdAt) &&
    typeof r.updatedAt === "string" &&
    isIsoDateTime(r.updatedAt)
  );
}
