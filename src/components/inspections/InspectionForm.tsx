"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea, describedBy } from "@/components/ui/Field";
import { toLocalIsoDate } from "@/lib/dates";
import { STRUCTURE_TYPES, STRUCTURE_TYPE_LABELS } from "@/lib/domain/constants";
import { createInspectionRecord } from "@/lib/domain/inspection";
import {
  INSPECTION_FIELD_LIMITS,
  validateInspectionInput,
  type FieldErrors,
  type InspectionField,
  type InspectionFormValues,
} from "@/lib/domain/validation";
import { describeStorageError } from "@/lib/storage/errors";
import { createInspection } from "@/lib/storage/inspections";

const EMPTY_VALUES: InspectionFormValues = {
  siteId: "",
  siteName: "",
  structureType: "",
  inspectorName: "",
  inspectionDate: "",
  location: "",
  weather: "",
  notes: "",
};

/** Visual order, used to focus the first invalid field. */
const FIELD_ORDER: readonly InspectionField[] = [
  "siteId",
  "siteName",
  "structureType",
  "location",
  "inspectorName",
  "inspectionDate",
  "weather",
  "notes",
];

const fieldId = (field: InspectionField) => `inspection-${field}`;

function validate(values: InspectionFormValues) {
  // Read the clock at validation time (event handlers), never during render.
  return validateInspectionInput(values, { today: toLocalIsoDate(new Date()) });
}

export function InspectionForm() {
  const router = useRouter();
  const [values, setValues] = useState<InspectionFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors<InspectionField>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function update(field: InspectionField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // After the first submit attempt, keep errors in sync while the user fixes them.
    if (submitted) {
      const result = validate(next);
      setErrors(result.ok ? {} : result.errors);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError(null);

    const result = validate(values);
    if (!result.ok) {
      setErrors(result.errors);
      const firstInvalid = FIELD_ORDER.find((field) => result.errors[field]);
      if (firstInvalid) document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const record = createInspectionRecord(result.value);
      await createInspection(record);
      // Next.js keeps this page mounted (hidden) after navigation; reset so the
      // next "New inspection" starts empty and enabled.
      setValues(EMPTY_VALUES);
      setErrors({});
      setSubmitted(false);
      setSaving(false);
      router.push(`/inspections/${record.id}`);
    } catch (error) {
      setSaveError(describeStorageError(error));
      setSaving(false);
    }
  }

  /** Common props for a text control bound to `field`. */
  function bind(field: InspectionField, hint?: string) {
    const error = errors[field];
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      invalid: Boolean(error),
      "aria-describedby": describedBy(fieldId(field), { error, hint }),
      disabled: saving,
    };
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {submitted && errorCount > 0 ? (
        <Callout tone="danger" title="The inspection was not saved">
          Please correct the {errorCount === 1 ? "highlighted field" : `${errorCount} highlighted fields`}.
        </Callout>
      ) : null}
      {saveError ? (
        <Callout tone="danger" title="The inspection could not be saved">
          {saveError}
        </Callout>
      ) : null}

      <Card>
        <CardHeader title="Site" description="The structure being inspected." />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field
            id={fieldId("siteId")}
            label="Site ID"
            required
            hint="Operator reference, e.g. TWR-0042."
            error={errors.siteId}
          >
            <Input
              {...bind("siteId", "Operator reference, e.g. TWR-0042.")}
              aria-required="true"
              autoComplete="off"
              maxLength={INSPECTION_FIELD_LIMITS.siteId}
              className="font-mono"
              onChange={(e) => update("siteId", e.target.value)}
            />
          </Field>
          <Field id={fieldId("siteName")} label="Site name" required error={errors.siteName}>
            <Input
              {...bind("siteName")}
              aria-required="true"
              maxLength={INSPECTION_FIELD_LIMITS.siteName}
              onChange={(e) => update("siteName", e.target.value)}
            />
          </Field>
          <Field
            id={fieldId("structureType")}
            label="Structure type"
            required
            error={errors.structureType}
          >
            <Select
              {...bind("structureType")}
              aria-required="true"
              onChange={(e) => update("structureType", e.target.value)}
            >
              <option value="" disabled>
                Select structure type
              </option>
              {STRUCTURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {STRUCTURE_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={fieldId("location")} label="Location / address" error={errors.location}>
            <Input
              {...bind("location")}
              maxLength={INSPECTION_FIELD_LIMITS.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Inspection" description="Who inspected the site, and when." />
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <Field
            id={fieldId("inspectorName")}
            label="Inspector name"
            required
            error={errors.inspectorName}
          >
            <Input
              {...bind("inspectorName")}
              aria-required="true"
              autoComplete="name"
              maxLength={INSPECTION_FIELD_LIMITS.inspectorName}
              onChange={(e) => update("inspectorName", e.target.value)}
            />
          </Field>
          <Field
            id={fieldId("inspectionDate")}
            label="Inspection date"
            required
            error={errors.inspectionDate}
            labelAction={
              <button
                type="button"
                disabled={saving}
                onClick={() => update("inspectionDate", toLocalIsoDate(new Date()))}
                className="rounded text-xs font-medium text-amber-700 hover:text-amber-900 focus-visible:outline-2 focus-visible:outline-amber-500 disabled:opacity-50"
              >
                Use today
              </button>
            }
          >
            <Input
              {...bind("inspectionDate")}
              type="date"
              aria-required="true"
              min="1990-01-01"
              onChange={(e) => update("inspectionDate", e.target.value)}
            />
          </Field>
          <Field
            id={fieldId("weather")}
            label="Weather"
            hint="Conditions that may affect visibility, e.g. overcast, light wind."
            error={errors.weather}
            className="sm:col-span-2"
          >
            <Input
              {...bind("weather", "Conditions that may affect visibility, e.g. overcast, light wind.")}
              maxLength={INSPECTION_FIELD_LIMITS.weather}
              onChange={(e) => update("weather", e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Field
            id={fieldId("notes")}
            label="Notes"
            hint="Access arrangements, scope limitations or anything else relevant."
            error={errors.notes}
          >
            <Textarea
              {...bind("notes", "Access arrangements, scope limitations or anything else relevant.")}
              maxLength={INSPECTION_FIELD_LIMITS.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link
          href="/"
          aria-disabled={saving}
          className={buttonClasses({ variant: "secondary", className: saving ? "pointer-events-none opacity-50" : undefined })}
        >
          Cancel
        </Link>
        <Button type="submit" disabled={saving}>
          {saving ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {saving ? "Saving…" : "Create inspection"}
        </Button>
      </div>
    </form>
  );
}
