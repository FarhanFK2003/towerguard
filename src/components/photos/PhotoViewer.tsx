"use client";

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { Download, FileImage, ImageOff, PencilLine, RotateCw, SearchX } from "lucide-react";
import { BackLink } from "@/components/layout/BackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useStoredImage } from "@/hooks/useStoredImage";
import { PHOTO_MIME_TYPE_LABELS } from "@/lib/domain/constants";
import type { ID, PhotoRecord } from "@/lib/domain/types";
import { formatBytes, formatTimestamp } from "@/lib/format";
import { describeStorageError } from "@/lib/storage/errors";
import { getPhoto, getPhotoOriginal } from "@/lib/storage/photos";
import { DeletePhotoButton } from "./DeletePhotoButton";
import { IntegrityCheck } from "./IntegrityCheck";
import { PhotoDetailsForm } from "./PhotoDetailsForm";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function PhotoViewer({ inspectionId, photoId }: { inspectionId: ID; photoId: ID }) {
  const load = useCallback(() => getPhoto(photoId), [photoId]);
  const { state, reload, refresh } = useAsyncData(load);

  if (state.status === "loading") return <PhotoViewerSkeleton />;

  if (state.status === "error") {
    return (
      <div className="space-y-6">
        <BackLink href={`/inspections/${inspectionId}`}>Inspection</BackLink>
        <Callout tone="danger" title="The photograph could not be loaded">
          <p>{describeStorageError(state.error)}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </Callout>
      </div>
    );
  }

  // A photo belonging to another inspection is treated as not found for this URL.
  if (!state.data || state.data.inspectionId !== inspectionId) {
    return (
      <EmptyState
        className="bg-white py-20"
        icon={<SearchX />}
        title="Photograph not found"
        description="It may have been deleted, or it belongs to a different inspection."
        action={
          <Link href={`/inspections/${inspectionId}`} className={buttonClasses({ variant: "secondary" })}>
            Back to inspection
          </Link>
        }
      />
    );
  }

  return <PhotoDetails photo={state.data} onUpdated={refresh} />;
}

function PhotoDetails({ photo, onUpdated }: { photo: PhotoRecord; onUpdated: () => void }) {
  const loadOriginal = useCallback(() => getPhotoOriginal(photo.id), [photo.id]);
  const image = useStoredImage(loadOriginal);

  return (
    <div className="space-y-6">
      <BackLink href={`/inspections/${photo.inspectionId}`}>Inspection</BackLink>

      <PageHeader
        eyebrow="Photograph"
        title={photo.caption ?? photo.fileName}
        description={photo.viewpoint ? `Viewpoint: ${photo.viewpoint}` : photo.caption ? photo.fileName : undefined}
        actions={
          <>
            {image.status === "ready" ? (
              <a href={image.url} download={photo.fileName} className={buttonClasses({ variant: "secondary" })}>
                <Download aria-hidden="true" />
                Download original
              </a>
            ) : null}
            <DeletePhotoButton photo={photo} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <figure className="space-y-2 lg:col-span-2">
          <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-slate-900">
            {image.status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL; next/image cannot optimise it
              <img
                src={image.url}
                alt={photo.caption ?? photo.fileName}
                className="max-h-[75vh] w-auto max-w-full object-contain"
              />
            ) : image.status === "loading" ? (
              <Skeleton className="h-96 w-full rounded-none bg-slate-800" />
            ) : (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-red-200">
                <ImageOff className="size-8" aria-hidden="true" />
                {image.status === "missing"
                  ? "The original image data is missing from storage."
                  : describeStorageError(image.error)}
              </div>
            )}
          </div>
          <figcaption className="text-xs text-slate-500">
            Original file as uploaded, displayed without modification.
          </figcaption>
        </figure>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Caption & viewpoint" icon={<PencilLine />} />
            <CardBody>
              <PhotoDetailsForm photo={photo} onSaved={onUpdated} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Evidence record" icon={<FileImage />} />
            <CardBody>
              <dl className="space-y-4">
                <Detail label="File name">
                  <span className="break-all">{photo.fileName}</span>
                </Detail>
                <Detail label="Format">{PHOTO_MIME_TYPE_LABELS[photo.mimeType]}</Detail>
                <Detail label="File size">
                  {formatBytes(photo.sizeBytes)}{" "}
                  <span className="text-slate-500">({photo.sizeBytes.toLocaleString("en-GB")} bytes)</span>
                </Detail>
                <Detail label="Dimensions">
                  <span className="tabular-nums">
                    {photo.width} × {photo.height} px
                  </span>
                </Detail>
                <Detail label="Uploaded">{formatTimestamp(photo.uploadedAt)}</Detail>
                {photo.updatedAt !== photo.uploadedAt ? (
                  <Detail label="Details last edited">{formatTimestamp(photo.updatedAt)}</Detail>
                ) : null}
                <Detail label="SHA-256 (original file)">
                  <span className="break-all font-mono text-xs text-slate-700" data-testid="photo-sha256">
                    {photo.sha256}
                  </span>
                </Detail>
              </dl>
              <div className="mt-4 border-t border-slate-200 pt-4">
                <IntegrityCheck photo={photo} />
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function PhotoViewerSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading photograph">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-lg lg:col-span-2" />
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
