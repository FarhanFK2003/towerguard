"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAnnotationRecord, type AnnotationPatch } from "@/lib/domain/annotation";
import type { Annotation, AnnotationShape, ID, PhotoRecord } from "@/lib/domain/types";
import type { AnnotationLabel } from "@/lib/domain/constants";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
} from "@/lib/storage/annotations";
import { describeStorageError } from "@/lib/storage/errors";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

type LoadState =
  | { status: "loading" }
  | { status: "ready"; damagedCount: number }
  | { status: "error"; message: string };

/**
 * Annotation state for one photograph. Changes are shown immediately and saved
 * to IndexedDB one at a time, in order. If a save fails, the list is reloaded
 * from storage so the screen never shows unsaved changes as saved.
 */
export function useAnnotations(photo: PhotoRecord, recordedBy: string) {
  const [items, setItems] = useState<Annotation[]>([]);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const photoId = photo.id;

  const reloadFromStorage = useCallback(async () => {
    try {
      const result = await listAnnotations(photoId);
      setItems(result.annotations);
      setLoad({ status: "ready", damagedCount: result.damaged.length });
    } catch (error) {
      setLoad({ status: "error", message: describeStorageError(error) });
    }
  }, [photoId]);

  useEffect(() => {
    let cancelled = false;
    listAnnotations(photoId).then(
      (result) => {
        if (cancelled) return;
        setItems(result.annotations);
        setLoad({ status: "ready", damagedCount: result.damaged.length });
      },
      (error: unknown) => {
        if (!cancelled) setLoad({ status: "error", message: describeStorageError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  /** Queues a storage operation; on failure the local list is resynchronised from storage. */
  const persist = useCallback(
    (operation: () => Promise<Annotation | void>) => {
      pending.current += 1;
      setSave({ status: "saving" });
      queue.current = queue.current.then(async () => {
        try {
          const stored = await operation();
          if (stored) setItems((prev) => prev.map((a) => (a.id === stored.id ? stored : a)));
          pending.current -= 1;
          if (pending.current === 0) setSave({ status: "saved" });
        } catch (error) {
          pending.current -= 1;
          setSave({ status: "error", message: describeStorageError(error) });
          await reloadFromStorage();
        }
      });
    },
    [reloadFromStorage],
  );

  const create = useCallback(
    (shape: AnnotationShape): ID => {
      const record = createAnnotationRecord({
        inspectionId: photo.inspectionId,
        photoId: photo.id,
        shape,
        recordedBy,
      });
      setItems((prev) => [...prev, record]);
      persist(() => createAnnotation(record));
      return record.id;
    },
    [photo.inspectionId, photo.id, recordedBy, persist],
  );

  const update = useCallback(
    (id: ID, patch: AnnotationPatch) => {
      setItems((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          const next: Annotation = { ...a, ...(patch.shape ? { shape: patch.shape } : {}) };
          if (Object.hasOwn(patch, "label")) {
            if (patch.label === undefined) delete next.label;
            else next.label = patch.label;
          }
          return next;
        }),
      );
      persist(() => updateAnnotation(id, patch));
    },
    [persist],
  );

  const setLabel = useCallback(
    (id: ID, label: AnnotationLabel | undefined) => update(id, { label }),
    [update],
  );

  const remove = useCallback(
    (id: ID) => {
      setItems((prev) => prev.filter((a) => a.id !== id));
      persist(() => deleteAnnotation(id));
    },
    [persist],
  );

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setSave({ status: "idle" });
    void reloadFromStorage();
  }, [reloadFromStorage]);

  return { items, load, save, create, update, setLabel, remove, retry };
}
