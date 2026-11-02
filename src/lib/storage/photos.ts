import { isPhotoBlobRecord, isPhotoRecord, applyPhotoDetails, type PhotoDetails } from "@/lib/domain/photo";
import type { ID, PhotoBlobRecord, PhotoRecord } from "@/lib/domain/types";
import { INDEXES, STORES, requestToPromise, withTransaction } from "./db";
import { StorageError } from "./errors";
import type { DamagedRecord } from "./inspections";

function photoNotFound(id: ID): StorageError {
  return new StorageError("not_found", `Photograph ${id} was not found.`);
}

export interface NewPhoto {
  record: PhotoRecord;
  original: Blob;
  thumbnail: Blob;
}

/**
 * Stores metadata and image data in one transaction: both are written or
 * neither is. Fails (without overwriting anything) if the inspection is gone,
 * the ID exists, or the same file (by SHA-256) is already attached.
 */
export async function addPhoto({ record, original, thumbnail }: NewPhoto): Promise<PhotoRecord> {
  if (!isPhotoRecord(record) || !(original instanceof Blob) || !(thumbnail instanceof Blob)) {
    throw new StorageError("invalid_record", "The photograph record is invalid and was not saved.");
  }
  await withTransaction(
    [STORES.inspections, STORES.photos, STORES.photoBlobs],
    "readwrite",
    async (tx) => {
      const inspection = await requestToPromise(tx.objectStore(STORES.inspections).getKey(record.inspectionId));
      if (inspection === undefined) {
        throw new StorageError("not_found", "The inspection no longer exists, so the photograph was not saved.");
      }

      const photos = tx.objectStore(STORES.photos);
      const siblings = await requestToPromise<unknown[]>(
        photos.index(INDEXES.byInspectionId).getAll(record.inspectionId),
      );
      const duplicate = siblings.find((p) => isPhotoRecord(p) && p.sha256 === record.sha256);
      if (duplicate && isPhotoRecord(duplicate)) {
        throw new StorageError(
          "already_exists",
          `This file is already attached to the inspection as "${duplicate.fileName}" (identical SHA-256).`,
        );
      }

      const blobs: PhotoBlobRecord = {
        photoId: record.id,
        inspectionId: record.inspectionId,
        original,
        thumbnail,
      };
      // `add` never overwrites: an existing key aborts the whole transaction.
      await requestToPromise(photos.add(record));
      await requestToPromise(tx.objectStore(STORES.photoBlobs).add(blobs));
    },
    "The photograph could not be saved.",
  );
  return record;
}

export interface PhotoListResult {
  /** Valid photo metadata, oldest upload first. */
  photos: PhotoRecord[];
  /** Metadata records that failed validation (reported, never modified). */
  damaged: DamagedRecord[];
  /** IDs of valid photos whose image data is missing. */
  missingImageIds: ID[];
}

/** Lists an inspection's photographs and reports damaged or incomplete records. */
export async function listPhotos(inspectionId: ID): Promise<PhotoListResult> {
  const { keys, records, imageKeys } = await withTransaction(
    [STORES.photos, STORES.photoBlobs],
    "readonly",
    async (tx) => {
      const byInspection = tx.objectStore(STORES.photos).index(INDEXES.byInspectionId);
      // Same index and range, so both calls return entries in the same order.
      const [keys, records, imageKeys] = await Promise.all([
        requestToPromise(byInspection.getAllKeys(inspectionId)),
        requestToPromise<unknown[]>(byInspection.getAll(inspectionId)),
        requestToPromise(tx.objectStore(STORES.photoBlobs).index(INDEXES.byInspectionId).getAllKeys(inspectionId)),
      ]);
      return { keys, records, imageKeys };
    },
    "Photographs could not be loaded.",
  );

  const withImages = new Set(imageKeys.map(String));
  const photos: PhotoRecord[] = [];
  const damaged: DamagedRecord[] = [];
  records.forEach((record, index) => {
    if (isPhotoRecord(record)) photos.push(record);
    else damaged.push({ key: String(keys[index]) });
  });
  photos.sort((a, b) =>
    a.uploadedAt === b.uploadedAt ? a.id.localeCompare(b.id) : a.uploadedAt < b.uploadedAt ? -1 : 1,
  );

  return {
    photos,
    damaged,
    missingImageIds: photos.filter((p) => !withImages.has(p.id)).map((p) => p.id),
  };
}

/** Photo metadata, or `undefined` if none exists with that ID. */
export async function getPhoto(id: ID): Promise<PhotoRecord | undefined> {
  const record = await withTransaction(
    STORES.photos,
    "readonly",
    (tx) => requestToPromise<unknown>(tx.objectStore(STORES.photos).get(id)),
    "The photograph could not be loaded.",
  );
  if (record === undefined) return undefined;
  if (!isPhotoRecord(record)) {
    throw new StorageError("invalid_record", "The stored photograph record is damaged and cannot be displayed.");
  }
  return record;
}

/**
 * The stored original or thumbnail. Returns `undefined` when the image data is
 * missing, and throws `invalid_record` when it exists but is damaged.
 */
export async function getPhotoImage(photoId: ID, variant: "original" | "thumbnail"): Promise<Blob | undefined> {
  const record = await withTransaction(
    STORES.photoBlobs,
    "readonly",
    (tx) => requestToPromise<unknown>(tx.objectStore(STORES.photoBlobs).get(photoId)),
    "The image could not be loaded.",
  );
  if (record === undefined) return undefined;
  if (!isPhotoBlobRecord(record)) {
    throw new StorageError("invalid_record", "The stored image data is damaged and cannot be displayed.");
  }
  return record[variant];
}

export const getPhotoOriginal = (photoId: ID) => getPhotoImage(photoId, "original");
export const getPhotoThumbnail = (photoId: ID) => getPhotoImage(photoId, "thumbnail");

/** Updates caption and viewpoint (validated by the caller). Image data is never touched. */
export async function updatePhotoDetails(
  id: ID,
  details: PhotoDetails,
  now: Date = new Date(),
): Promise<PhotoRecord> {
  return withTransaction(
    STORES.photos,
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.photos);
      const existing = await requestToPromise<unknown>(store.get(id));
      if (existing === undefined) throw photoNotFound(id);
      if (!isPhotoRecord(existing)) {
        throw new StorageError("invalid_record", "The stored photograph record is damaged and cannot be updated.");
      }
      const updated = applyPhotoDetails(existing, details, now);
      if (!isPhotoRecord(updated)) {
        throw new StorageError("invalid_record", "The update would make the photograph record invalid.");
      }
      await requestToPromise(store.put(updated));
      return updated;
    },
    "The photograph details could not be saved.",
  );
}

async function deleteAnnotationsForPhoto(tx: IDBTransaction, photoId: IDBValidKey): Promise<number> {
  const store = tx.objectStore(STORES.annotations);
  const keys = await requestToPromise(store.index(INDEXES.byPhotoId).getAllKeys(photoId));
  await Promise.all(keys.map((key) => requestToPromise(store.delete(key))));
  return keys.length;
}

/**
 * Deletes a photograph's metadata, image data and annotations in one
 * transaction. Other photographs are not affected.
 */
export async function deletePhoto(id: ID): Promise<void> {
  await withTransaction(
    [STORES.photos, STORES.photoBlobs, STORES.annotations],
    "readwrite",
    async (tx) => {
      const photos = tx.objectStore(STORES.photos);
      const existing = await requestToPromise(photos.getKey(id));
      if (existing === undefined) throw photoNotFound(id);
      await deleteAnnotationsForPhoto(tx, id);
      await requestToPromise(tx.objectStore(STORES.photoBlobs).delete(id));
      await requestToPromise(photos.delete(id));
    },
    "The photograph could not be deleted.",
  );
}

/**
 * Deletes every photograph of an inspection (metadata, image data and their
 * annotations) in one transaction. The inspection itself is kept.
 */
export async function deletePhotosForInspection(inspectionId: ID): Promise<number> {
  return withTransaction(
    [STORES.photos, STORES.photoBlobs, STORES.annotations],
    "readwrite",
    async (tx) => {
      const photos = tx.objectStore(STORES.photos);
      const blobs = tx.objectStore(STORES.photoBlobs);
      const [photoKeys, blobKeys] = await Promise.all([
        requestToPromise(photos.index(INDEXES.byInspectionId).getAllKeys(inspectionId)),
        requestToPromise(blobs.index(INDEXES.byInspectionId).getAllKeys(inspectionId)),
      ]);
      for (const key of photoKeys) await deleteAnnotationsForPhoto(tx, key);
      await Promise.all([
        ...blobKeys.map((key) => requestToPromise(blobs.delete(key))),
        ...photoKeys.map((key) => requestToPromise(photos.delete(key))),
      ]);
      return photoKeys.length;
    },
    "The photographs could not be deleted.",
  );
}
