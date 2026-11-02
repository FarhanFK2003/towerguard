import { isIsoDateTime } from "@/lib/dates";
import { PHOTO_MIME_TYPES, isOneOf, type PhotoMimeType } from "./constants";
import { newId } from "./ids";
import type { ID, PhotoBlobRecord, PhotoRecord } from "./types";
import type { FieldErrors, ValidationResult } from "./validation";

/** Facts measured from an uploaded file. */
export interface PhotoFacts {
  inspectionId: ID;
  fileName: string;
  mimeType: PhotoMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
}

/** Inspector-editable photo fields. `undefined` clears a field. */
export interface PhotoDetails {
  caption?: string;
  viewpoint?: string;
}

export const PHOTO_DETAIL_LIMITS = { caption: 500, viewpoint: 200 } as const;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Builds photo metadata. `id` and `now` are injectable for tests. */
export function createPhotoRecord(
  facts: PhotoFacts,
  options: { id?: ID; now?: Date } = {},
): PhotoRecord {
  const timestamp = (options.now ?? new Date()).toISOString();
  return {
    id: options.id ?? newId(),
    inspectionId: facts.inspectionId,
    fileName: facts.fileName,
    mimeType: facts.mimeType,
    sizeBytes: facts.sizeBytes,
    width: facts.width,
    height: facts.height,
    sha256: facts.sha256,
    uploadedAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Applies caption/viewpoint changes. Everything else, including the hash, is immutable. */
export function applyPhotoDetails(existing: PhotoRecord, details: PhotoDetails, now: Date = new Date()): PhotoRecord {
  const next: PhotoRecord = { ...existing, updatedAt: now.toISOString() };
  const caption = Object.hasOwn(details, "caption") ? details.caption : existing.caption;
  const viewpoint = Object.hasOwn(details, "viewpoint") ? details.viewpoint : existing.viewpoint;
  if (caption === undefined) delete next.caption;
  else next.caption = caption;
  if (viewpoint === undefined) delete next.viewpoint;
  else next.viewpoint = viewpoint;
  return next;
}

/** Validates the caption/viewpoint form. Blank values clear the field. */
export function validatePhotoDetails(input: {
  caption: string;
  viewpoint: string;
}): ValidationResult<PhotoDetails, keyof PhotoDetails> {
  const errors: FieldErrors<keyof PhotoDetails> = {};
  const caption = input.caption.trim();
  const viewpoint = input.viewpoint.trim();
  if (caption.length > PHOTO_DETAIL_LIMITS.caption) {
    errors.caption = `Caption must be ${PHOTO_DETAIL_LIMITS.caption} characters or fewer.`;
  }
  if (viewpoint.length > PHOTO_DETAIL_LIMITS.viewpoint) {
    errors.viewpoint = `Viewpoint must be ${PHOTO_DETAIL_LIMITS.viewpoint} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { caption: caption || undefined, viewpoint: viewpoint || undefined },
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Runtime guard for photo metadata read from storage. */
export function isPhotoRecord(value: unknown): value is PhotoRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    isNonEmptyString(r.id) &&
    isNonEmptyString(r.inspectionId) &&
    isNonEmptyString(r.fileName) &&
    isOneOf(PHOTO_MIME_TYPES, r.mimeType) &&
    isPositiveInteger(r.sizeBytes) &&
    isPositiveInteger(r.width) &&
    isPositiveInteger(r.height) &&
    typeof r.sha256 === "string" &&
    SHA256_HEX.test(r.sha256) &&
    typeof r.uploadedAt === "string" &&
    isIsoDateTime(r.uploadedAt) &&
    typeof r.updatedAt === "string" &&
    isIsoDateTime(r.updatedAt) &&
    (r.caption === undefined || typeof r.caption === "string") &&
    (r.viewpoint === undefined || typeof r.viewpoint === "string")
  );
}

/** Runtime guard for stored image data. */
export function isPhotoBlobRecord(value: unknown): value is PhotoBlobRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    isNonEmptyString(r.photoId) &&
    isNonEmptyString(r.inspectionId) &&
    r.original instanceof Blob &&
    r.thumbnail instanceof Blob
  );
}
