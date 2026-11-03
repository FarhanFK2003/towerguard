"use client";

import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Info, LoaderCircle, Paperclip, RotateCw, Save, SearchX, Trash2 } from "lucide-react";
import { BackLink } from "@/components/layout/BackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { cn } from "@/lib/cn";
import {
  DEFECT_CATEGORIES,
  DEFECT_CATEGORY_LABELS,
  ENGINEERING_SEVERITY_LABELS,
  FINDING_STATUSES,
  FINDING_STATUS_LABELS,
  INSPECTOR_PRIORITIES,
  INSPECTOR_PRIORITY_LABELS,
} from "@/lib/domain/constants";
import {
  FINDING_LIMITS,
  createFindingRecord,
  findingToFormValues,
  normalizeEvidence,
  toggleAnnotation,
  validateFindingInput,
  type FindingField,
  type FindingFormValues,
} from "@/lib/domain/finding";
import type { Annotation, EvidenceLink, Finding, ID, Inspection, PhotoRecord } from "@/lib/domain/types";
import type { FieldErrors } from "@/lib/domain/validation";
import { formatTimestamp } from "@/lib/format";
import { listAnnotationsForInspection } from "@/lib/storage/annotations";
import { describeStorageError } from "@/lib/storage/errors";
import { createFinding, deleteFinding, getFinding, updateFinding } from "@/lib/storage/findings";
import { getInspection } from "@/lib/storage/inspections";
import { listPhotos } from "@/lib/storage/photos";
import { EvidenceEditor } from "./EvidenceEditor";
import { FindingStatusBadge, PRIORITY_STYLE, PriorityBadge, STATUS_EXPLANATIONS, STATUS_STYLE } from "./FindingBadges";

interface EditorData {
  inspection: Inspection | undefined;
  photos: PhotoRecord[];
  annotations: Annotation[];
  finding: Finding | undefined;
}

const FIELD_ORDER: readonly FindingField[] = ["title", "description", "category", "priority", "status", "componentLocation", "recommendedAction"];
const fieldId = (field: FindingField) => `finding-${field}`;

/**
 * Create (no `findingId`) or view/edit (with `findingId`) a finding. A new
 * finding can be pre-linked to a photograph and annotation, e.g. from the
 * annotation workspace.
 */
export function FindingEditor({
  inspectionId,
  findingId,
  initialPhotoId,
  initialAnnotationId,
}: {
  inspectionId: ID;
  findingId?: ID;
  initialPhotoId?: ID;
  initialAnnotationId?: ID;
}) {
  const load = useCallback(async (): Promise<EditorData> => {
    const [inspection, photoList, annotations, finding] = await Promise.all([
      getInspection(inspectionId),
      listPhotos(inspectionId),
      listAnnotationsForInspection(inspectionId),
      findingId ? getFinding(findingId) : Promise.resolve(undefined),
    ]);
    return { inspection, photos: photoList.photos, annotations, finding };
  }, [inspectionId, findingId]);
  const { state, reload } = useAsyncData(load);
  const [formGeneration, setFormGeneration] = useState(0);

  if (state.status === "loading") return <EditorSkeleton />;
  if (state.status === "error") {
    return (
      <Callout tone="danger" title="The finding could not be loaded">
        <p>{describeStorageError(state.error)}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </Callout>
    );
  }
  const { inspection, finding } = state.data;
  if (!inspection || (findingId && (!finding || finding.inspectionId !== inspectionId))) {
    return (
      <EmptyState
        className="bg-white py-20"
        icon={<SearchX />}
        title={inspection ? "Finding not found" : "Inspection not found"}
        description="It may have been deleted, or it belongs to a different inspection."
        action={
          <Link href={inspection ? `/inspections/${inspectionId}/findings` : "/"} className={buttonClasses({ variant: "secondary" })}>
            {inspection ? "Back to findings" : "Back to dashboard"}
          </Link>
        }
      />
    );
  }

  // Pre-link evidence only if the referenced photo/annotation really belong to this inspection.
  let initialEvidence: EvidenceLink[] = finding?.evidence ?? [];
  let prefillProblem: string | null = null;
  if (!finding && initialPhotoId) {
    const photo = state.data.photos.find((p) => p.id === initialPhotoId);
    const annotation = initialAnnotationId ? state.data.annotations.find((a) => a.id === initialAnnotationId) : undefined;
    if (!photo || (initialAnnotationId && (!annotation || annotation.photoId !== photo.id))) {
      prefillProblem = "The selected photograph or annotation could not be found in this inspection, so it was not linked.";
    } else {
      initialEvidence = annotation ? toggleAnnotation([], photo.id, annotation.id) : [{ photoId: photo.id, annotationIds: [] }];
    }
  }

  return (
    <EditorForm
      // Fresh form state per finding version, per pre-linked evidence, and after each creation.
      key={finding?.updatedAt ?? `new-${initialPhotoId ?? ""}-${initialAnnotationId ?? ""}-${formGeneration}`}
      onCreated={() => setFormGeneration((n) => n + 1)}
      inspection={inspection}
      photos={state.data.photos}
      annotations={state.data.annotations}
      finding={finding}
      initialEvidence={initialEvidence}
      prefillProblem={prefillProblem}
    />
  );
}

function ChoiceGroup<T extends string>({
  name,
  label,
  value,
  options,
  render,
  error,
  disabled,
  onChange,
}: {
  name: FindingField;
  label: string;
  value: string;
  options: readonly T[];
  render: (option: T) => ReactNode;
  error?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset aria-describedby={error ? `${fieldId(name)}-error` : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-slate-800">
        {label}
        <span className="text-red-600" aria-hidden="true">
          {" "}
          *
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2" id={fieldId(name)} tabIndex={-1}>
        {options.map((option) => {
          const id = `${fieldId(name)}-${option}`;
          return (
            <label
              key={option}
              htmlFor={id}
              data-choice={`${name}:${option}`}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                value === option ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500" : "border-slate-300 bg-white hover:bg-slate-50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option}
                checked={value === option}
                disabled={disabled}
                onChange={() => onChange(option)}
                className="mt-0.5 size-4 accent-amber-600"
              />
              <span className="min-w-0">{render(option)}</span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={`${fieldId(name)}-error`} className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function EditorForm({
  inspection,
  photos,
  annotations,
  finding,
  initialEvidence,
  prefillProblem,
  onCreated,
}: {
  inspection: Inspection;
  photos: PhotoRecord[];
  annotations: Annotation[];
  finding: Finding | undefined;
  initialEvidence: EvidenceLink[];
  prefillProblem: string | null;
  /** Called after a new finding is saved, so the (preserved) form can reset. */
  onCreated: () => void;
}) {
  const router = useRouter();
  const initialValues = useMemo(() => findingToFormValues(finding), [finding]);
  const [values, setValues] = useState<FindingFormValues>(initialValues);
  const [evidence, setEvidence] = useState<EvidenceLink[]>(initialEvidence);
  const [errors, setErrors] = useState<FieldErrors<FindingField>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [current, setCurrent] = useState<Finding | undefined>(finding);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const annotationsByPhoto = useMemo(() => {
    const map = new Map<ID, Annotation[]>();
    for (const a of annotations) map.set(a.photoId, [...(map.get(a.photoId) ?? []), a]);
    return map;
  }, [annotations]);

  const isNew = !current;
  const findingsHref = `/inspections/${inspection.id}/findings`;
  const dirty =
    JSON.stringify(values) !== JSON.stringify(current ? findingToFormValues(current) : initialValues) ||
    JSON.stringify(normalizeEvidence(evidence)) !== JSON.stringify(current?.evidence ?? initialEvidence);

  function update(field: FindingField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaveError(null);
    const result = validateFindingInput(values);
    if (!result.ok) {
      setErrors(result.errors);
      const first = FIELD_ORDER.find((f) => result.errors[f]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (!current) {
        const record = createFindingRecord(result.value, evidence, { inspectionId: inspection.id, recordedBy: inspection.inspectorName });
        await createFinding(record);
        // Next.js keeps this page mounted (hidden); start the next "New finding" fresh.
        onCreated();
        router.replace(`${findingsHref}/${record.id}`);
        return;
      }
      const updated = await updateFinding(current.id, { fields: result.value, evidence }, inspection.inspectorName);
      setCurrent(updated);
      setValues(findingToFormValues(updated));
      setEvidence(updated.evidence);
      setSaved(true);
      setSaving(false);
    } catch (error) {
      setSaveError(describeStorageError(error));
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!current) return;
    setDeleting(true);
    try {
      await deleteFinding(current.id);
      // Reset before leaving: Next.js keeps this page mounted (hidden) after navigation.
      setConfirmDelete(false);
      setDeleting(false);
      router.replace(findingsHref);
    } catch (error) {
      setSaveError(describeStorageError(error));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const bind = (field: Exclude<FindingField, "category" | "priority" | "status">) => ({
    id: fieldId(field),
    value: values[field],
    invalid: Boolean(errors[field]),
    "aria-describedby": describedBy(fieldId(field), { error: errors[field] }),
    disabled: saving,
    onChange: (e: { target: { value: string } }) => update(field, e.target.value),
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <BackLink href={findingsHref}>Findings</BackLink>
      <PageHeader
        eyebrow={`Finding · ${inspection.siteName} (${inspection.siteId})`}
        title={current ? current.title : "New finding"}
        description={
          current ? (
            <span className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={current.inspectorPriority} />
              <FindingStatusBadge status={current.status} />
            </span>
          ) : (
            "Document an inspection observation and link the photographs and annotations that support it."
          )
        }
        actions={
          current ? (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          ) : undefined
        }
      />

      {prefillProblem ? <Callout tone="warning" title="Evidence not linked">{prefillProblem}</Callout> : null}
      {Object.keys(errors).some((k) => errors[k as FindingField]) ? (
        <Callout tone="danger" title="The finding was not saved">
          Please correct the highlighted fields.
        </Callout>
      ) : null}
      {saveError ? (
        <Callout tone="danger" title="The finding could not be saved">
          {saveError}
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-5">
              <Field id={fieldId("title")} label="Title" required error={errors.title}>
                <Input {...bind("title")} aria-required="true" maxLength={FINDING_LIMITS.title} />
              </Field>
              <Field id={fieldId("description")} label="Description" required error={errors.description}>
                <Textarea {...bind("description")} aria-required="true" maxLength={FINDING_LIMITS.description} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={fieldId("category")} label="Category" required error={errors.category}>
                  <Select
                    id={fieldId("category")}
                    value={values.category}
                    invalid={Boolean(errors.category)}
                    aria-required="true"
                    aria-describedby={describedBy(fieldId("category"), { error: errors.category })}
                    disabled={saving}
                    onChange={(e) => update("category", e.target.value)}
                  >
                    <option value="" disabled>
                      Select category
                    </option>
                    {DEFECT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {DEFECT_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id={fieldId("componentLocation")} label="Component location" error={errors.componentLocation}>
                  <Input {...bind("componentLocation")} maxLength={FINDING_LIMITS.componentLocation} placeholder="e.g. Leg B, section 3" />
                </Field>
              </div>
              <ChoiceGroup
                name="priority"
                label="Inspector priority"
                value={values.priority}
                options={[...INSPECTOR_PRIORITIES]}
                error={errors.priority}
                disabled={saving}
                onChange={(v) => update("priority", v)}
                render={(p) => (
                  <span className="inline-flex items-center gap-1.5 [&_svg]:size-4">
                    {PRIORITY_STYLE[p].icon}
                    {INSPECTOR_PRIORITY_LABELS[p]}
                  </span>
                )}
              />
              <p className="-mt-3 text-xs text-slate-500">
                Your follow-up priority. It is not derived from the category and is not an engineering severity rating.
              </p>
              <ChoiceGroup
                name="status"
                label="Status"
                value={values.status}
                options={[...FINDING_STATUSES]}
                error={errors.status}
                disabled={saving}
                onChange={(v) => update("status", v)}
                render={(s) => (
                  <span>
                    <span className="inline-flex items-center gap-1.5 font-medium [&_svg]:size-4">
                      {STATUS_STYLE[s].icon}
                      {FINDING_STATUS_LABELS[s]}
                    </span>
                    <span className="block text-xs text-slate-500">{STATUS_EXPLANATIONS[s]}</span>
                  </span>
                )}
              />
              <Field id={fieldId("recommendedAction")} label="Recommended action" error={errors.recommendedAction}>
                <Textarea {...bind("recommendedAction")} className="min-h-20" maxLength={FINDING_LIMITS.recommendedAction} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Evidence"
              description="Photographs and annotated regions from this inspection."
              icon={<Paperclip />}
            />
            <CardBody>
              <EvidenceEditor
                photos={photos}
                annotationsByPhoto={annotationsByPhoto}
                evidence={evidence}
                disabled={saving}
                onChange={(next) => {
                  setEvidence(next);
                  setSaved(false);
                }}
              />
            </CardBody>
          </Card>

          <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            {saved && !dirty ? (
              <p className="inline-flex items-center gap-1 text-sm text-emerald-700 sm:mr-auto" role="status">
                <CircleCheck className="size-4" aria-hidden="true" />
                Saved
              </p>
            ) : null}
            <Link href={findingsHref} className={buttonClasses({ variant: "secondary" })}>
              {isNew ? "Cancel" : "Back to findings"}
            </Link>
            <Button type="submit" disabled={saving || (!isNew && !dirty)}>
              {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
              {saving ? "Saving…" : isNew ? "Create finding" : "Save changes"}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Callout tone="info" title="What the statuses mean">
            <ul className="space-y-1">
              {FINDING_STATUSES.map((s) => (
                <li key={s}>
                  <span className="font-medium">{FINDING_STATUS_LABELS[s]}:</span> {STATUS_EXPLANATIONS[s]}
                </li>
              ))}
            </ul>
          </Callout>
          <Card>
            <CardHeader title="Record" icon={<Info />} />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Source</dt>
                  <dd>Entered manually by {current?.provenance.recordedBy ?? inspection.inspectorName}</dd>
                </div>
                {current ? (
                  <>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Created</dt>
                      <dd>{formatTimestamp(current.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last updated</dt>
                      <dd>{formatTimestamp(current.updatedAt)}</dd>
                    </div>
                    {current.review ? (
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Reviewed</dt>
                        <dd data-testid="finding-review">
                          {FINDING_STATUS_LABELS[current.status]} by {current.review.reviewedBy}, {formatTimestamp(current.review.reviewedAt)}
                        </dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Engineering assessment</dt>
                  <dd>
                    {ENGINEERING_SEVERITY_LABELS[current?.engineeringSeverity ?? "not_assessed"]}.{" "}
                    <span className="text-slate-500">TowerGuard does not perform engineering assessments.</span>
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      {current ? (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this finding?"
          description="The finding and its evidence links will be removed. The linked photographs and annotations are not deleted."
          confirmLabel={deleting ? "Deleting…" : "Delete finding"}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </form>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading finding">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-7 w-72 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-lg lg:col-span-2" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
