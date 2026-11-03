"use client";

import { useState, type FormEvent } from "react";
import { CircleCheck, LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Input, Textarea, describedBy } from "@/components/ui/Field";
import { PHOTO_DETAIL_LIMITS, validatePhotoDetails, type PhotoDetails } from "@/lib/domain/photo";
import type { PhotoRecord } from "@/lib/domain/types";
import type { FieldErrors } from "@/lib/domain/validation";
import { describeStorageError } from "@/lib/storage/errors";
import { updatePhotoDetails } from "@/lib/storage/photos";

const VIEWPOINT_HINT = 'Where the photo was taken from, e.g. "North face, upper section".';

export function PhotoDetailsForm({
  photo,
  readOnly = false,
  onSaved,
}: {
  photo: PhotoRecord;
  /** Finalised inspection: details are shown but cannot be changed. */
  readOnly?: boolean;
  onSaved: (updated: PhotoRecord) => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [viewpoint, setViewpoint] = useState(photo.viewpoint ?? "");
  const [errors, setErrors] = useState<FieldErrors<keyof PhotoDetails>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty = caption.trim() !== (photo.caption ?? "") || viewpoint.trim() !== (photo.viewpoint ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setSavedAt(null);
    const result = validatePhotoDetails({ caption, viewpoint });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const updated = await updatePhotoDetails(photo.id, result.value);
      setCaption(updated.caption ?? "");
      setViewpoint(updated.viewpoint ?? "");
      setSavedAt(updated.updatedAt);
      onSaved(updated);
    } catch (error) {
      setSaveError(describeStorageError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {saveError ? (
        <Callout tone="danger" title="Changes were not saved">
          {saveError}
        </Callout>
      ) : null}
      <Field id="photo-caption" label="Caption" error={errors.caption}>
        <Textarea
          id="photo-caption"
          value={caption}
          rows={3}
          className="min-h-20"
          maxLength={PHOTO_DETAIL_LIMITS.caption}
          invalid={Boolean(errors.caption)}
          aria-describedby={describedBy("photo-caption", { error: errors.caption })}
          disabled={saving || readOnly}
          onChange={(e) => {
            setCaption(e.target.value);
            setSavedAt(null);
          }}
        />
      </Field>
      <Field id="photo-viewpoint" label="Viewpoint" hint={VIEWPOINT_HINT} error={errors.viewpoint}>
        <Input
          id="photo-viewpoint"
          value={viewpoint}
          maxLength={PHOTO_DETAIL_LIMITS.viewpoint}
          invalid={Boolean(errors.viewpoint)}
          aria-describedby={describedBy("photo-viewpoint", { error: errors.viewpoint, hint: VIEWPOINT_HINT })}
          disabled={saving || readOnly}
          onChange={(e) => {
            setViewpoint(e.target.value);
            setSavedAt(null);
          }}
        />
      </Field>
      {readOnly ? (
        <p className="text-xs text-slate-500">The inspection is finalised, so these details cannot be changed.</p>
      ) : (
        <div className="flex items-center justify-end gap-3">
          {savedAt && !dirty ? (
            <p className="inline-flex items-center gap-1 text-sm text-emerald-700" role="status">
              <CircleCheck className="size-4" aria-hidden="true" />
              Saved
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={saving || !dirty}>
            {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {saving ? "Saving…" : "Save details"}
          </Button>
        </div>
      )}
    </form>
  );
}
