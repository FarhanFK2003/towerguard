"use client";

import { useState } from "react";
import Link from "next/link";
import { ListPlus, MapPin, SquareDashedMousePointer, Trash2, VectorSquare } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Select } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import {
  ANNOTATION_LABELS,
  ANNOTATION_LABEL_NAMES,
  ANNOTATION_SHAPE_LABELS,
  isOneOf,
  type AnnotationLabel,
} from "@/lib/domain/constants";
import type { Annotation, AnnotationShape, ID, PhotoRecord } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/format";
import { annotationColor } from "./annotation-colors";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

function describeShape(shape: AnnotationShape, photo: PhotoRecord): string {
  if (shape.kind === "point") {
    return `x ${pct(shape.x)}, y ${pct(shape.y)} (≈ ${Math.round(shape.x * photo.width)}, ${Math.round(shape.y * photo.height)} px)`;
  }
  return `x ${pct(shape.x)}, y ${pct(shape.y)}, ${pct(shape.width)} × ${pct(shape.height)} (≈ ${Math.round(shape.width * photo.width)} × ${Math.round(shape.height * photo.height)} px)`;
}

export function AnnotationPanel({
  photo,
  annotations,
  selectedId,
  onSelect,
  onLabelChange,
  onDelete,
  readOnly = false,
  damagedCount,
}: {
  photo: PhotoRecord;
  annotations: readonly Annotation[];
  selectedId: ID | null;
  onSelect: (id: ID | null) => void;
  onLabelChange: (id: ID, label: AnnotationLabel | undefined) => void;
  onDelete: (id: ID) => void;
  /** Finalised inspection: details are visible; label, finding creation and deletion are unavailable. */
  readOnly?: boolean;
  damagedCount: number;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedIndex = annotations.findIndex((a) => a.id === selectedId);
  const selected = selectedIndex >= 0 ? annotations[selectedIndex] : undefined;

  return (
    <Card>
      <CardHeader
        title="Annotations"
        description={`${annotations.length} on this photograph · entered manually`}
        icon={<SquareDashedMousePointer />}
      />
      <CardBody className="space-y-4">
        {damagedCount > 0 ? (
          <Callout tone="warning" title={`${damagedCount} annotation record${damagedCount === 1 ? "" : "s"} could not be displayed`}>
            Stored but damaged; not changed or deleted.
          </Callout>
        ) : null}

        {annotations.length === 0 ? (
          <p className="text-sm text-slate-500">
            No annotations yet. Choose <span className="font-medium text-slate-700">Rectangle</span> or{" "}
            <span className="font-medium text-slate-700">Point</span>, then draw on the photograph.
          </p>
        ) : (
          <ol className="space-y-1" aria-label="Annotation list">
            {annotations.map((annotation, index) => {
              const isSelected = annotation.id === selectedId;
              return (
                <li key={annotation.id}>
                  <button
                    type="button"
                    data-annotation-item={annotation.id}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : annotation.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-500",
                      isSelected ? "border-amber-400 bg-amber-50" : "border-transparent hover:bg-slate-50",
                    )}
                  >
                    <span
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white ring-2"
                      // The overlay's white "no label" colour would vanish on this white panel.
                      style={{ ["--tw-ring-color" as string]: annotation.label ? annotationColor(annotation.label) : "#94a3b8" }}
                    >
                      {index + 1}
                    </span>
                    <span className="text-slate-500 [&_svg]:size-4" title={ANNOTATION_SHAPE_LABELS[annotation.shape.kind]}>
                      {annotation.shape.kind === "rect" ? <VectorSquare aria-hidden="true" /> : <MapPin aria-hidden="true" />}
                      <span className="sr-only">{ANNOTATION_SHAPE_LABELS[annotation.shape.kind]}</span>
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", annotation.label ? "text-slate-900" : "text-slate-500 italic")}>
                      {annotation.label ? ANNOTATION_LABEL_NAMES[annotation.label] : "No label"}
                    </span>
                    {isSelected ? <span className="text-xs font-medium text-amber-700">Selected</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {selected ? (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3" data-testid="annotation-details">
            <p className="text-sm font-semibold text-slate-900">
              #{selectedIndex + 1} · {ANNOTATION_SHAPE_LABELS[selected.shape.kind]}
            </p>
            <Field id="annotation-label" label="Label" hint="Assigned by you. Not an automated classification.">
              <Select
                id="annotation-label"
                value={selected.label ?? ""}
                disabled={readOnly}
                onChange={(e) => {
                  const value = e.target.value;
                  onLabelChange(selected.id, isOneOf(ANNOTATION_LABELS, value) ? value : undefined);
                }}
              >
                <option value="">No label</option>
                {ANNOTATION_LABELS.map((label) => (
                  <option key={label} value={label}>
                    {ANNOTATION_LABEL_NAMES[label]}
                  </option>
                ))}
              </Select>
            </Field>
            <dl className="space-y-1 text-xs text-slate-600">
              <div>
                <dt className="inline font-medium text-slate-700">Position: </dt>
                <dd className="inline tabular-nums" data-testid="annotation-position">
                  {describeShape(selected.shape, photo)}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium text-slate-700">Recorded: </dt>
                <dd className="inline">
                  manually by {selected.provenance.recordedBy}, {formatTimestamp(selected.createdAt)}
                </dd>
              </div>
            </dl>
            {readOnly ? (
              <p className="text-xs text-slate-500">The inspection is finalised, so this annotation cannot be changed.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/inspections/${photo.inspectionId}/findings/new?photo=${encodeURIComponent(photo.id)}&annotation=${encodeURIComponent(selected.id)}`}
                  className={buttonClasses({ size: "sm" })}
                  data-testid="create-finding-from-annotation"
                >
                  <ListPlus aria-hidden="true" />
                  Create finding from annotation
                </Link>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden="true" />
                  Delete annotation
                </Button>
              </div>
            )}
            <ConfirmDialog
              open={confirmDelete}
              title={`Delete annotation #${selectedIndex + 1}?`}
              description="The marked region and its label will be removed from this photograph, and unlinked from any finding that uses it. The photograph and the findings themselves are kept."
              confirmLabel="Delete annotation"
              onConfirm={() => {
                setConfirmDelete(false);
                onDelete(selected.id);
              }}
              onCancel={() => setConfirmDelete(false)}
            />
          </div>
        ) : annotations.length > 0 ? (
          <p className="text-xs text-slate-500">Select an annotation in the list or on the photograph to edit it.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
