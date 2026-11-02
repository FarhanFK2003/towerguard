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
