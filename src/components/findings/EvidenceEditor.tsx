"use client";

import { useCallback } from "react";
import { ImageOff, Paperclip, Plus, X } from "lucide-react";
import { annotationColor } from "@/components/annotations/annotation-colors";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Skeleton } from "@/components/ui/Skeleton";
import { useStoredImage } from "@/hooks/useStoredImage";
import { cn } from "@/lib/cn";
import { ANNOTATION_LABEL_NAMES, ANNOTATION_SHAPE_LABELS } from "@/lib/domain/constants";
import { attachPhoto, detachPhoto, toggleAnnotation } from "@/lib/domain/finding";
import type { Annotation, EvidenceLink, ID, PhotoRecord } from "@/lib/domain/types";
import { getPhotoThumbnail } from "@/lib/storage/photos";

export function EvidenceThumb({ photoId, alt, className }: { photoId: ID; alt: string; className?: string }) {
  const load = useCallback(() => getPhotoThumbnail(photoId), [photoId]);
  const image = useStoredImage(load);
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded bg-slate-100", className)}>
      {image.status === "ready" ? (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL; next/image cannot optimise it
        <img src={image.url} alt={alt} className="size-full object-cover" />
      ) : image.status === "loading" ? (
        <Skeleton className="size-full rounded-none" />
      ) : (
        <div className="flex size-full items-center justify-center text-red-600">
          <ImageOff className="size-5" aria-label="Image unavailable" />
        </div>
      )}
    </div>
  );
}

/**
 * Chooses which photographs and annotations support a finding. Only references
 * change here; photographs and annotations themselves are never modified.
 * Annotations are numbered per photograph in creation order, as in the
 * annotation workspace, but stored by their permanent IDs.
 */
export function EvidenceEditor({
  photos,
  annotationsByPhoto,
  evidence,
  onChange,
  disabled: busy,
  readOnly = false,
}: {
  photos: readonly PhotoRecord[];
  annotationsByPhoto: ReadonlyMap<ID, readonly Annotation[]>;
  evidence: readonly EvidenceLink[];
  onChange: (evidence: EvidenceLink[]) => void;
  /** Temporarily disabled (e.g. while saving). */
  disabled?: boolean;
  /** Finalised inspection: show the linked evidence only, with no attach/remove controls. */
  readOnly?: boolean;
}) {
  const disabled = busy || readOnly;
  const attachedIds = new Set(evidence.map((l) => l.photoId));
  const available = photos.filter((p) => !attachedIds.has(p.id));

  return (
    <div className="space-y-4">
      {evidence.length === 0 ? (
        readOnly ? (
          <p className="text-sm text-slate-500">No evidence was linked to this finding.</p>
        ) : (
          <Callout tone="info" title="No evidence linked yet">
            Attach the photographs, and the annotated regions on them, that support this finding.
          </Callout>
        )
      ) : (
        <ul className="space-y-3" aria-label="Linked evidence">
          {evidence.map((link) => {
            const photo = photos.find((p) => p.id === link.photoId);
            const annotations = annotationsByPhoto.get(link.photoId) ?? [];
            const unknown = link.annotationIds.filter((id) => !annotations.some((a) => a.id === id));
            return (
              <li key={link.photoId} data-evidence-photo={link.photoId} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  {photo ? (
                    <EvidenceThumb photoId={photo.id} alt={photo.caption ?? photo.fileName} className="h-16 w-20" />
                  ) : (
                    <div className="flex h-16 w-20 items-center justify-center rounded bg-red-50 text-red-600">
                      <ImageOff className="size-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {photo ? photo.fileName : "Photograph unavailable"}
                    </p>
                    {photo?.caption || photo?.viewpoint ? (
                      <p className="truncate text-xs text-slate-500">{[photo.caption, photo.viewpoint].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      {link.annotationIds.length === 0
                        ? "Whole photograph"
                        : `${link.annotationIds.length} annotation${link.annotationIds.length === 1 ? "" : "s"} linked`}
                    </p>
                  </div>
                  {readOnly ? null : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      data-remove-photo={link.photoId}
                      aria-label={`Remove ${photo?.fileName ?? "photograph"} from this finding`}
                      onClick={() => onChange(detachPhoto(evidence, link.photoId))}
                    >
                      <X aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </div>

                {annotations.length > 0 || unknown.length > 0 ? (
                  <fieldset className="mt-3 border-t border-slate-100 pt-2">
                    <legend className="sr-only">Annotations on {photo?.fileName ?? "this photograph"}</legend>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {annotations.map((annotation, index) => {
                        const checked = link.annotationIds.includes(annotation.id);
                        const inputId = `ev-${annotation.id}`;
                        return (
                          <li key={annotation.id}>
                            <label
                              htmlFor={inputId}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50",
                                checked && "bg-amber-50",
                              )}
                            >
                              <input
                                id={inputId}
                                type="checkbox"
                                data-evidence-annotation={annotation.id}
                                checked={checked}
                                disabled={disabled}
                                onChange={() => onChange(toggleAnnotation(evidence, link.photoId, annotation.id))}
                                className="size-4 accent-amber-600"
                              />
                              <span
                                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white ring-2"
                                style={{ ["--tw-ring-color" as string]: annotation.label ? annotationColor(annotation.label) : "#94a3b8" }}
                              >
                                {index + 1}
                              </span>
                              <span className="truncate">
                                {ANNOTATION_SHAPE_LABELS[annotation.shape.kind]} ·{" "}
                                {annotation.label ? ANNOTATION_LABEL_NAMES[annotation.label] : <span className="italic text-slate-500">No label</span>}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                      {unknown.map((id) => (
                        <li key={id}>
                          <label className="flex items-center gap-2 rounded bg-red-50 px-2 py-1.5 text-sm text-red-800">
                            <input
                              type="checkbox"
                              checked
                              disabled={disabled}
                              onChange={() => onChange(toggleAnnotation(evidence, link.photoId, id))}
                              className="size-4"
                            />
                            Unavailable annotation (untick to remove)
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No annotations on this photograph; the whole photograph is linked.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {readOnly ? null : (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Paperclip className="size-4 text-slate-500" aria-hidden="true" />
            Attach photographs from this inspection
          </p>
          {photos.length === 0 ? (
            <p className="text-sm text-slate-500">This inspection has no photographs yet.</p>
          ) : available.length === 0 ? (
            <p className="text-sm text-slate-500">All photographs of this inspection are attached.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Photographs available to attach">
              {available.map((photo) => {
                const count = annotationsByPhoto.get(photo.id)?.length ?? 0;
                return (
                  <li key={photo.id} className="overflow-hidden rounded-md border border-slate-200">
                    <EvidenceThumb photoId={photo.id} alt={photo.caption ?? photo.fileName} className="aspect-[4/3] w-full rounded-none" />
                    <div className="space-y-1.5 p-2">
                      <p className="truncate text-xs font-medium text-slate-900" title={photo.fileName}>
                        {photo.fileName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {count} annotation{count === 1 ? "" : "s"}
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        disabled={disabled}
                        data-attach-photo={photo.id}
                        aria-label={`Attach ${photo.fileName}`}
                        onClick={() => onChange(attachPhoto(evidence, photo.id))}
                      >
                        <Plus aria-hidden="true" />
                        Attach
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
