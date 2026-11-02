import { isIsoDate, isIsoDateTime } from "@/lib/dates";
import {
  INSPECTION_STATUSES,
  STRUCTURE_TYPES,
  isOneOf,
  type InspectionStatus,
  type StructureType,
} from "./constants";
import type { InspectionFields, InspectionPatch } from "./inspection";
import type { Inspection, IsoDate } from "./types";

/** Raw form values as typed by the user. */
export interface InspectionFormValues {
  siteId: string;
  siteName: string;
  structureType: string;
  inspectorName: string;
  inspectionDate: string;
  location: string;
  weather: string;
  notes: string;
}

export type InspectionField = keyof InspectionFormValues;
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type ValidationResult<T, K extends string> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors<K> };

export const INSPECTION_FIELD_LIMITS = {
  siteId: 64,
  siteName: 120,
  inspectorName: 120,
  location: 200,
  weather: 120,
  notes: 4000,
} as const;

/** Earliest accepted inspection date; guards against typos such as `0226`. */
export const MIN_INSPECTION_DATE: IsoDate = "1990-01-01";

type TextField = keyof typeof INSPECTION_FIELD_LIMITS;

const TEXT_FIELD_LABELS: Record<TextField, string> = {
  siteId: "Site ID",
  siteName: "Site name",
  inspectorName: "Inspector name",
  location: "Location",
  weather: "Weather",
  notes: "Notes",
};

type Check<T> = { ok: true; value: T } | { ok: false; error: string };

function requiredText(field: TextField, raw: string): Check<string> {
  const value = raw.trim();
  const label = TEXT_FIELD_LABELS[field];
  if (value === "") return { ok: false, error: `${label} is required.` };
  const max = INSPECTION_FIELD_LIMITS[field];
  if (value.length > max) return { ok: false, error: `${label} must be ${max} characters or fewer.` };
  return { ok: true, value };
}

/** Empty optional text normalises to `undefined`. */
function optionalText(field: TextField, raw: string): Check<string | undefined> {
  const value = raw.trim();
  if (value === "") return { ok: true, value: undefined };
  const max = INSPECTION_FIELD_LIMITS[field];
  if (value.length > max) {
    return { ok: false, error: `${TEXT_FIELD_LABELS[field]} must be ${max} characters or fewer.` };
  }
  return { ok: true, value };
}

function structureType(raw: string): Check<StructureType> {
  return isOneOf(STRUCTURE_TYPES, raw)
    ? { ok: true, value: raw }
    : { ok: false, error: "Select a structure type." };
}

function inspectionDate(raw: string, today: IsoDate): Check<IsoDate> {
  const value = raw.trim();
  if (value === "") return { ok: false, error: "Inspection date is required." };
  if (!isIsoDate(value)) return { ok: false, error: "Enter a valid date." };
  // ISO dates compare correctly as strings.
  if (value < MIN_INSPECTION_DATE) {
    return { ok: false, error: "Inspection date must be in 1990 or later." };
  }
  if (value > today) return { ok: false, error: "Inspection date cannot be in the future." };
  return { ok: true, value };
}

function inspectionStatus(raw: string): Check<InspectionStatus> {
  return isOneOf(INSPECTION_STATUSES, raw)
    ? { ok: true, value: raw }
    : { ok: false, error: "Select a valid status." };
}

/** Merges per-field checks into one result. Fields absent from `checks` are left out. */
function collect<O extends object>(checks: {
  [P in keyof O]?: Check<O[P]>;
}): ValidationResult<O, Extract<keyof O, string>> {
  const errors: FieldErrors<Extract<keyof O, string>> = {};
  const value: Partial<O> = {};
  for (const key of Object.keys(checks) as Extract<keyof O, string>[]) {
    const check = checks[key];
    if (!check) continue;
    if (check.ok) value[key] = check.value;
    else errors[key] = check.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: value as O };
}

export interface ValidationOptions {
  /** Today's local date; inspection dates after it are rejected. */
  today: IsoDate;
}

/** Validates and normalises a new-inspection form. */
export function validateInspectionInput(
  input: InspectionFormValues,
  { today }: ValidationOptions,
): ValidationResult<InspectionFields, InspectionField> {
  return collect<InspectionFields>({
    siteId: requiredText("siteId", input.siteId),
    siteName: requiredText("siteName", input.siteName),
    structureType: structureType(input.structureType),
    inspectorName: requiredText("inspectorName", input.inspectorName),
    inspectionDate: inspectionDate(input.inspectionDate, today),
    location: optionalText("location", input.location),
    weather: optionalText("weather", input.weather),
    notes: optionalText("notes", input.notes),
  });
}

export type InspectionPatchInput = Partial<InspectionFormValues> & { status?: string };

/**
 * Validates an update. Only fields present in `input` are checked; required
 * fields cannot be blanked, and blank optional fields clear the stored value.
 */
export function validateInspectionPatch(
  input: InspectionPatchInput,
  { today }: ValidationOptions,
): ValidationResult<InspectionPatch, keyof InspectionPatch> {
  const checks: { [K in keyof InspectionPatch]?: Check<InspectionPatch[K]> } = {};
  if (input.siteId !== undefined) checks.siteId = requiredText("siteId", input.siteId);
  if (input.siteName !== undefined) checks.siteName = requiredText("siteName", input.siteName);
  if (input.structureType !== undefined) checks.structureType = structureType(input.structureType);
  if (input.inspectorName !== undefined) {
    checks.inspectorName = requiredText("inspectorName", input.inspectorName);
  }
  if (input.inspectionDate !== undefined) {
    checks.inspectionDate = inspectionDate(input.inspectionDate, today);
  }
  if (input.location !== undefined) checks.location = optionalText("location", input.location);
  if (input.weather !== undefined) checks.weather = optionalText("weather", input.weather);
  if (input.notes !== undefined) checks.notes = optionalText("notes", input.notes);
  if (input.status !== undefined) checks.status = inspectionStatus(input.status);
  return collect<InspectionPatch>(checks);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

/** Runtime guard for records read from storage or imported from files. */
export function isInspection(value: unknown): value is Inspection {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record.id) &&
    isNonEmptyString(record.siteId) &&
    isNonEmptyString(record.siteName) &&
    isOneOf(STRUCTURE_TYPES, record.structureType) &&
    isNonEmptyString(record.inspectorName) &&
    typeof record.inspectionDate === "string" &&
    isIsoDate(record.inspectionDate) &&
    isOptionalString(record.location) &&
    isOptionalString(record.weather) &&
    isOptionalString(record.notes) &&
    isOneOf(INSPECTION_STATUSES, record.status) &&
    typeof record.createdAt === "string" &&
    isIsoDateTime(record.createdAt) &&
    typeof record.updatedAt === "string" &&
    isIsoDateTime(record.updatedAt)
  );
}
