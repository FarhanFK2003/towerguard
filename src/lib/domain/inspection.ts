import type { InspectionStatus, StructureType } from "./constants";
import { newId } from "./ids";
import type { ID, Inspection, IsoDate } from "./types";

/** Inspector-editable inspection fields (validated, normalised values). */
export interface InspectionFields {
  siteId: string;
  siteName: string;
  structureType: StructureType;
  inspectorName: string;
  inspectionDate: IsoDate;
  location?: string;
  weather?: string;
  notes?: string;
}

/** A partial update. An optional field present with `undefined` clears it. */
export type InspectionPatch = Partial<InspectionFields> & { status?: InspectionStatus };

const PATCHABLE_KEYS = [
  "siteId",
  "siteName",
  "structureType",
  "inspectorName",
  "inspectionDate",
  "location",
  "weather",
  "notes",
  "status",
] as const satisfies readonly (keyof InspectionPatch)[];

/** Drops properties whose value is `undefined`, so stored records stay tidy. */
function stripUndefined<T extends object>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

/** Builds a new draft inspection. `id` and `now` are injectable for tests. */
export function createInspectionRecord(
  fields: InspectionFields,
  options: { id?: ID; now?: Date } = {},
): Inspection {
  const timestamp = (options.now ?? new Date()).toISOString();
  return stripUndefined({
    id: options.id ?? newId(),
    siteId: fields.siteId,
    siteName: fields.siteName,
    structureType: fields.structureType,
    inspectorName: fields.inspectorName,
    inspectionDate: fields.inspectionDate,
    location: fields.location,
    weather: fields.weather,
    notes: fields.notes,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

/**
 * Applies a patch to an inspection. Only editable keys are copied, so `id` and
 * `createdAt` can never be changed through an update.
 */
export function applyInspectionPatch(
  existing: Inspection,
  patch: InspectionPatch,
  now: Date = new Date(),
): Inspection {
  const changes: InspectionPatch = {};
  for (const key of PATCHABLE_KEYS) {
    if (Object.hasOwn(patch, key)) {
      Object.assign(changes, { [key]: patch[key] });
    }
  }
  return stripUndefined({
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now.toISOString(),
  });
}

// ---- Review lifecycle -----------------------------------------------------
//
//   draft → in_review → finalised, and finalised → in_review (reopen).
// Finalised means the inspector completed the documentation; it is not a
// structural safety or engineering assessment.

export type LifecycleResult = { ok: true; value: Inspection } | { ok: false; error: string };

/** draft → in_review: fieldwork complete; still editable. */
export function startInspectionReview(inspection: Inspection, now: Date = new Date()): LifecycleResult {
  if (inspection.status !== "draft") {
    return { ok: false, error: "Only a draft inspection can start review." };
  }
  return { ok: true, value: { ...inspection, status: "in_review", updatedAt: now.toISOString() } };
}

/**
 * in_review → finalised, recording who finalised and when. Readiness must be
 * checked separately (see `assessReadiness`).
 */
export function finaliseInspectionRecord(
  inspection: Inspection,
  finalisedBy: string,
  now: Date = new Date(),
): LifecycleResult {
  if (inspection.status !== "in_review") {
    return { ok: false, error: "Only an inspection in review can be finalised." };
  }
  if (finalisedBy.trim() === "") return { ok: false, error: "The inspector's name is required to finalise." };
  const timestamp = now.toISOString();
  return {
    ok: true,
    value: {
      ...inspection,
      status: "finalised",
      finalisation: { finalisedBy, finalisedAt: timestamp },
      updatedAt: timestamp,
    },
  };
}

/** finalised → in_review: clears the finalisation and restores editing. */
export function reopenInspectionRecord(inspection: Inspection, now: Date = new Date()): LifecycleResult {
  if (inspection.status !== "finalised") {
    return { ok: false, error: "Only a finalised inspection can be reopened." };
  }
  const value: Inspection = { ...inspection, status: "in_review", updatedAt: now.toISOString() };
  delete value.finalisation;
  return { ok: true, value };
}