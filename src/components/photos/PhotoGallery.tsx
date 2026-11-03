"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { ImageUp, Images, LoaderCircle, RotateCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { cn } from "@/lib/cn";
import type { ID } from "@/lib/domain/types";
import { formatBytes } from "@/lib/format";
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT } from "@/lib/photos/validation";
import { describeStorageError } from "@/lib/storage/errors";
import { listPhotos } from "@/lib/storage/photos";
import { PhotoThumb } from "./PhotoThumb";
import { UploadResults } from "./UploadResults";
import { usePhotoUpload } from "./usePhotoUpload";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PhotoGallery({
  inspectionId,
  readOnly = false,
  onStorageChanged,
}: {
  inspectionId: ID;
  /** Finalised inspection: photographs can be viewed but not added. */
  readOnly?: boolean;
  /** Called after photographs are stored, so storage usage can be re-read. */
  onStorageChanged?: () => void;
}) {
  const load = useCallback(() => listPhotos(inspectionId), [inspectionId]);
  const { state, reload, refresh } = useAsyncData(load);
  const onSaved = useCallback(() => {
    refresh();
    onStorageChanged?.();
  }, [refresh, onStorageChanged]);
  const { items, busy, upload, clear } = usePhotoUpload(inspectionId, onSaved);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const photos = state.status === "ready" ? state.data.photos : [];
  const empty = state.status === "ready" && photos.length === 0;

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = busy ? "none" : "copy";
    if (!busy) setDragActive(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (!busy) void upload(Array.from(event.dataTransfer.files));
  }

  const openPicker = () => inputRef.current?.click();

  return (
    <Card>
      <CardHeader
        title="Photographs"
        description={
          state.status === "ready"
            ? `${plural(photos.length, "photograph", "photographs")} · originals stored unchanged`
            : "Original photographs, stored unchanged."
        }
        icon={<Images />}
        action={
          readOnly ? undefined : (
            <Button size="sm" onClick={openPicker} disabled={busy}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {busy ? "Uploading…" : "Upload photographs"}
            </Button>
          )
        }
      />
      {readOnly ? null : (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PHOTO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose photographs to upload"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = ""; // allow selecting the same file again
            void upload(files);
          }}
        />
      )}
      <CardBody className="space-y-4">
        {readOnly ? (
          <p className="text-sm text-slate-500" data-testid="uploads-disabled">
            The inspection is finalised, so photographs cannot be added. Originals remain viewable and downloadable.
          </p>
        ) : (
          <div
            role="group"
            aria-label="Photo drop zone"
            onDragEnter={onDragOver}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 text-center transition-colors",
              empty ? "py-10" : "py-5",
              dragActive ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-slate-50/60",
            )}
          >
            <ImageUp className={cn("text-slate-400", empty ? "size-8" : "size-6")} aria-hidden="true" />
            {empty ? <p className="mt-3 text-sm font-semibold text-slate-900">No photographs yet</p> : null}
            <p className={cn("text-sm text-slate-600", empty ? "mt-1" : "mt-2")}>
              Drag and drop photographs here, or{" "}
              <button
                type="button"
                onClick={openPicker}
                disabled={busy}
                className="rounded font-medium text-amber-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-amber-500 disabled:opacity-50"
              >
                browse files
              </button>
              .
            </p>
            <p className="mt-1 text-xs text-slate-500">
              JPEG, PNG or WebP, up to {formatBytes(MAX_PHOTO_BYTES)} each. Originals are kept byte-for-byte and
              fingerprinted with SHA-256.
            </p>
          </div>
        )}

        {items.length > 0 ? <UploadResults items={items} busy={busy} onDismiss={clear} /> : null}

        {state.status === "loading" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading photographs">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-md" />
            ))}
          </div>
        ) : state.status === "error" ? (
          <Callout tone="danger" title="Photographs could not be loaded">
            <p>{describeStorageError(state.error)}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </Callout>
        ) : (
          <>
            {state.data.damaged.length > 0 || state.data.missingImageIds.length > 0 ? (
              <Callout tone="warning" title="Some photographs cannot be displayed">
                <ul className="list-disc space-y-0.5 pl-4">
                  {state.data.damaged.length > 0 ? (
                    <li>
                      {plural(state.data.damaged.length, "photo record is", "photo records are")} damaged and not
                      shown.
                    </li>
                  ) : null}
                  {state.data.missingImageIds.length > 0 ? (
                    <li>
                      {plural(state.data.missingImageIds.length, "photograph is", "photographs are")} missing image
                      data.
                    </li>
                  ) : null}
                </ul>
                <p className="mt-1">Nothing has been changed or deleted.</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
                  <RotateCw aria-hidden="true" />
                  Try again
                </Button>
              </Callout>
            ) : null}
            {photos.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Photographs">
                {photos.map((photo) => (
                  <li key={photo.id}>
                    <PhotoThumb photo={photo} imageMissing={state.data.missingImageIds.includes(photo.id)} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}
