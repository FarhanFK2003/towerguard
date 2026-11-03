import { isAnnotation } from "@/lib/domain/annotation";
import { isFinding } from "@/lib/domain/finding";
import { isPhotoRecord } from "@/lib/domain/photo";
import type { Annotation, Finding, ID, Inspection, PhotoRecord } from "@/lib/domain/types";
import { isInspection } from "@/lib/domain/validation";
import { INDEXES, STORES, requestToPromise, withTransaction } from "./db";
import { StorageError } from "./errors";
import type { DamagedRecord } from "./inspections";

/**
 * Everything stored for one inspection, read in a single read-only transaction
 * so reports and exports see one consistent state. Damaged records are
 * returned separately (never repaired, hidden or modified).
 */
export interface InspectionSnapshot {
  inspection: Inspection;
  /** Valid photo metadata, oldest upload first. */
  photos: PhotoRecord[];
  damagedPhotos: DamagedRecord[];
  /** Valid photos whose image data record is missing. */
  missingImageIds: ID[];
  /** Valid annotations, oldest first. */
  annotations: Annotation[];
  damagedAnnotations: DamagedRecord[];
  /** Valid findings, oldest first. */
  findings: Finding[];
  damagedFindings: DamagedRecord[];
}

function partition<T>(keys: IDBValidKey[], records: unknown[], guard: (value: unknown) => value is T) {
  const valid: T[] = [];
  const damaged: DamagedRecord[] = [];
  records.forEach((record, index) => {
    if (guard(record)) valid.push(record);
    else damaged.push({ key: String(keys[index]) });
  });
  return { valid, damaged };
}

const chronological = <T extends { id: string }>(time: (item: T) => string) => (a: T, b: T) =>
  time(a) === time(b) ? a.id.localeCompare(b.id) : time(a) < time(b) ? -1 : 1;

/** Reads the inspection and all its records, or `undefined` if the inspection does not exist. */
export async function readInspectionSnapshot(inspectionId: ID): Promise<InspectionSnapshot | undefined> {
  return withTransaction(
    [STORES.inspections, STORES.photos, STORES.photoBlobs, STORES.annotations, STORES.findings],
    "readonly",
    async (tx) => {
      const inspection = await requestToPromise<unknown>(tx.objectStore(STORES.inspections).get(inspectionId));
      if (inspection === undefined) return undefined;
      if (!isInspection(inspection)) {
        throw new StorageError("invalid_record", "The stored inspection record is damaged, so a report cannot be produced.");
      }
      const byInspection = (store: (typeof STORES)[keyof typeof STORES]) => tx.objectStore(store).index(INDEXES.byInspectionId);
      // Same index and range per store, so keys and records come back in the same order.
      const [photoKeys, photoRecords, imageKeys, annotationKeys, annotationRecords, findingKeys, findingRecords] = await Promise.all([
        requestToPromise(byInspection(STORES.photos).getAllKeys(inspectionId)),
        requestToPromise<unknown[]>(byInspection(STORES.photos).getAll(inspectionId)),
        requestToPromise(byInspection(STORES.photoBlobs).getAllKeys(inspectionId)),
        requestToPromise(byInspection(STORES.annotations).getAllKeys(inspectionId)),
        requestToPromise<unknown[]>(byInspection(STORES.annotations).getAll(inspectionId)),
        requestToPromise(byInspection(STORES.findings).getAllKeys(inspectionId)),
        requestToPromise<unknown[]>(byInspection(STORES.findings).getAll(inspectionId)),
      ]);

      const photos = partition(photoKeys, photoRecords, isPhotoRecord);
      const annotations = partition(annotationKeys, annotationRecords, isAnnotation);
      const findings = partition(findingKeys, findingRecords, isFinding);
      const withImages = new Set(imageKeys.map(String));
      const sortedPhotos = photos.valid.sort(chronological((p) => p.uploadedAt));

      return {
        inspection,
        photos: sortedPhotos,
        damagedPhotos: photos.damaged,
        missingImageIds: sortedPhotos.filter((p) => !withImages.has(p.id)).map((p) => p.id),
        annotations: annotations.valid.sort(chronological((a) => a.createdAt)),
        damagedAnnotations: annotations.damaged,
        findings: findings.valid.sort(chronological((f) => f.createdAt)),
        damagedFindings: findings.damaged,
      };
    },
    "The inspection data could not be read.",
  );
}
