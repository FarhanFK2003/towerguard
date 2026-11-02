"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ImageOff } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useStoredImage } from "@/hooks/useStoredImage";
import type { PhotoRecord } from "@/lib/domain/types";
import { getPhotoThumbnail } from "@/lib/storage/photos";

export function PhotoThumb({ photo, imageMissing }: { photo: PhotoRecord; imageMissing: boolean }) {
  const load = useCallback(
    () => (imageMissing ? Promise.resolve(undefined) : getPhotoThumbnail(photo.id)),
    [photo.id, imageMissing],
  );
  const image = useStoredImage(load);

  return (
    <Link
      href={`/inspections/${photo.inspectionId}/photos/${photo.id}`}
      data-photo-id={photo.id}
      className="group block overflow-hidden rounded-md border border-slate-200 bg-white transition-colors hover:border-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
    >
      <div className="relative aspect-[4/3] bg-slate-100">
        {image.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL; next/image cannot optimise it
          <img
            src={image.url}
            alt={photo.caption ?? photo.fileName}
            className="size-full object-cover"
            decoding="async"
          />
        ) : image.status === "loading" ? (
          <Skeleton className="size-full rounded-none" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-xs font-medium text-red-700">
            <ImageOff className="size-5" aria-hidden="true" />
            {image.status === "missing" ? "Image data missing" : "Image data damaged"}
          </div>
        )}
      </div>
      <div className="space-y-0.5 px-2.5 py-2">
        <p className="truncate text-xs font-medium text-slate-900" title={photo.fileName}>
          {photo.fileName}
        </p>
        <p className="text-xs text-slate-500 tabular-nums">
          {photo.width} × {photo.height} px
        </p>
        {photo.caption ? (
          <p className="truncate text-xs text-slate-600" title={photo.caption}>
            {photo.caption}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
