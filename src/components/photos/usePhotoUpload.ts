"use client";

import { useCallback, useRef, useState } from "react";
import type { ID } from "@/lib/domain/types";
import { PhotoError } from "@/lib/photos/errors";
import { preparePhoto } from "@/lib/photos/prepare";
import { assertStorageAvailable, estimateRequiredBytes, readStorageEstimate } from "@/lib/photos/storage-check";
import { inspectPhotoFile } from "@/lib/photos/validation";
import { StorageError, describeStorageError } from "@/lib/storage/errors";
import { addPhoto } from "@/lib/storage/photos";

export type UploadStatus = "queued" | "processing" | "saved" | "rejected" | "failed";

export interface UploadItem {
  key: string;
  fileName: string;
  sizeBytes: number;
  status: UploadStatus;
  message?: string;
}

export const FINISHED_STATUSES: readonly UploadStatus[] = ["saved", "rejected", "failed"];

/** Rejected = the file itself can't be accepted; failed = something went wrong saving it. */
function outcome(error: unknown): { status: UploadStatus; message: string } {
  if (error instanceof PhotoError) {
    return { status: error.code === "insufficient_storage" || error.code === "unavailable" ? "failed" : "rejected", message: error.message };
  }
  if (error instanceof StorageError && error.code === "already_exists") {
    return { status: "rejected", message: error.message };
  }
  return { status: "failed", message: describeStorageError(error) };
}

/**
 * Validates and stores a batch of files. Each file is handled independently,
 * every outcome is reported, and files are processed one at a time so only one
 * full-resolution image is decoded at once.
 */
export function usePhotoUpload(inspectionId: ID, onSaved: () => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const batchRef = useRef(0);

  const update = useCallback((key: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }, []);

  const upload = useCallback(
    async (selected: readonly File[]) => {
      if (selected.length === 0 || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      batchRef.current += 1;
      const batch = selected.map((file, index) => ({ file, key: `${batchRef.current}-${index}` }));
      setItems(batch.map(({ key, file }) => ({ key, fileName: file.name, sizeBytes: file.size, status: "queued" })));

      try {
        // 1. Validate every file on its own so one bad file doesn't block the rest.
        const accepted: typeof batch = [];
        for (const entry of batch) {
          try {
            await inspectPhotoFile(entry.file);
            accepted.push(entry);
          } catch (error) {
            update(entry.key, outcome(error));
          }
        }
        if (accepted.length === 0) return;

        // 2. Make sure the accepted files are likely to fit before writing anything.
        try {
          assertStorageAvailable(
            estimateRequiredBytes(accepted.map((entry) => entry.file.size)),
            await readStorageEstimate(),
          );
        } catch (error) {
          for (const entry of accepted) update(entry.key, outcome(error));
          return;
        }

        // 3. Hash, decode, thumbnail and store, one file at a time.
        let savedCount = 0;
        for (const entry of accepted) {
          update(entry.key, { status: "processing" });
          try {
            await addPhoto(await preparePhoto(entry.file, inspectionId));
            savedCount += 1;
            update(entry.key, { status: "saved" });
            onSaved();
          } catch (error) {
            update(entry.key, outcome(error));
          }
        }

        // Ask the browser not to evict evidence under storage pressure (it may decline).
        if (savedCount > 0 && navigator.storage?.persist) {
          navigator.storage.persist().catch(() => undefined);
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [inspectionId, onSaved, update],
  );

  const clear = useCallback(() => setItems([]), []);

  return { items, busy, upload, clear };
}
