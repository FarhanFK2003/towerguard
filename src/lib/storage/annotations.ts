import { applyAnnotationPatch, isAnnotation, type AnnotationPatch } from "@/lib/domain/annotation";
import { detachAnnotation } from "@/lib/domain/finding";
import { isPhotoRecord } from "@/lib/domain/photo";
import type { Annotation, ID } from "@/lib/domain/types";
import { INDEXES, STORES, requestToPromise, withTransaction } from "./db";
import { StorageError } from "./errors";
import { pruneFindingEvidence } from "./findings";
import { assertInspectionEditable } from "./guards";
import type { DamagedRecord } from "./inspections";

function annotationNotFound(id: ID): StorageError {
  return new StorageError("not_found", `Annotation ${id} was not found.`);
}

const byCreation = (a: Annotation, b: Annotation) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1;

/**
 * Saves a new annotation. Fails without writing if the record is invalid, the
 * photograph is gone or belongs to a different inspection, or the ID exists.
 */
export async function createAnnotation(annotation: Annotation): Promise<Annotation> {
  if (!isAnnotation(annotation)) {
    throw new StorageError("invalid_record", "The annotation is invalid and was not saved.");
  }
  await withTransaction(
    [STORES.inspections, STORES.photos, STORES.annotations],
    "readwrite",
    async (tx) => {
      await assertInspectionEditable(tx, annotation.inspectionId);
      const photo = await requestToPromise<unknown>(tx.objectStore(STORES.photos).get(annotation.photoId));
      if (photo === undefined) {
        throw new StorageError("not_found", "The photograph no longer exists, so the annotation was not saved.");
      }
      if (!isPhotoRecord(photo) || photo.inspectionId !== annotation.inspectionId) {
        throw new StorageError("invalid_record", "The annotation does not match its photograph and was not saved.");
      }
      await requestToPromise(tx.objectStore(STORES.annotations).add(annotation));
    },
    "The annotation could not be saved.",
  );
  return annotation;
}

export interface AnnotationListResult {
  /** Valid annotations, oldest first (the order they are numbered in). */
  annotations: Annotation[];
  /** Records that failed validation (reported, never modified). */
  damaged: DamagedRecord[];
}

/** All annotations on a photograph. */
export async function listAnnotations(photoId: ID): Promise<AnnotationListResult> {
  const { keys, records } = await withTransaction(
    STORES.annotations,
    "readonly",
    async (tx) => {
      const byPhoto = tx.objectStore(STORES.annotations).index(INDEXES.byPhotoId);
      // Same index and range, so both calls return entries in the same order.
      const [keys, records] = await Promise.all([
        requestToPromise(byPhoto.getAllKeys(photoId)),
        requestToPromise<unknown[]>(byPhoto.getAll(photoId)),
      ]);
      return { keys, records };
    },
    "Annotations could not be loaded.",
  );
  const annotations: Annotation[] = [];
  const damaged: DamagedRecord[] = [];
  records.forEach((record, index) => {
    if (isAnnotation(record)) annotations.push(record);
    else damaged.push({ key: String(keys[index]) });
  });
  return { annotations: annotations.sort(byCreation), damaged };
}

export async function getAnnotation(id: ID): Promise<Annotation | undefined> {
  const record = await withTransaction(
    STORES.annotations,
    "readonly",
    (tx) => requestToPromise<unknown>(tx.objectStore(STORES.annotations).get(id)),
    "The annotation could not be loaded.",
  );
  if (record === undefined) return undefined;
  if (!isAnnotation(record)) {
    throw new StorageError("invalid_record", "The stored annotation is damaged and cannot be displayed.");
  }
  return record;
}

/** Changes an annotation's shape and/or label. Invalid results are rejected unsaved. */
export async function updateAnnotation(id: ID, patch: AnnotationPatch, now: Date = new Date()): Promise<Annotation> {
  return withTransaction(
    [STORES.inspections, STORES.annotations],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.annotations);
      const existing = await requestToPromise<unknown>(store.get(id));
      if (existing === undefined) throw annotationNotFound(id);
      if (!isAnnotation(existing)) {
        throw new StorageError("invalid_record", "The stored annotation is damaged and cannot be updated.");
      }
      await assertInspectionEditable(tx, existing.inspectionId);
      const updated = applyAnnotationPatch(existing, patch, now);
      if (!isAnnotation(updated)) {
        throw new StorageError("invalid_record", "The change would make the annotation invalid and was not saved.");
      }
      await requestToPromise(store.put(updated));
      return updated;
    },
    "The annotation could not be updated.",
  );
}

/**
 * Deletes an annotation and, in the same transaction, unlinks it from any
 * finding. The findings and their photograph links are kept.
 */
export async function deleteAnnotation(id: ID): Promise<void> {
  await withTransaction(
    [STORES.inspections, STORES.annotations, STORES.findings],
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.annotations);
      const existing = await requestToPromise<unknown>(store.get(id));
      if (existing === undefined) throw annotationNotFound(id);
      const inspectionId = (existing as { inspectionId?: unknown }).inspectionId;
      // Lock check before any write: neither the annotation nor finding links change if finalised.
      if (typeof inspectionId === "string") await assertInspectionEditable(tx, inspectionId, { allowMissing: true });
      await requestToPromise(store.delete(id));
      if (typeof inspectionId === "string") {
        await pruneFindingEvidence(tx, inspectionId, (evidence) => detachAnnotation(evidence, id));
      }
    },
    "The annotation could not be deleted.",
  );
}

/** All valid annotations of an inspection (for choosing finding evidence), oldest first. */
export async function listAnnotationsForInspection(inspectionId: ID): Promise<Annotation[]> {
  const records = await withTransaction(
    STORES.annotations,
    "readonly",
    (tx) => requestToPromise<unknown[]>(tx.objectStore(STORES.annotations).index(INDEXES.byInspectionId).getAll(inspectionId)),
    "Annotations could not be loaded.",
  );
  return records.filter(isAnnotation).sort(byCreation);
}
