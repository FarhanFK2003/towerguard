import { isFinding } from "@/lib/domain/finding";
import {
  applyInspectionPatch,
  finaliseInspectionRecord,
  reopenInspectionRecord,
  startInspectionReview as startReviewTransition,
  type InspectionPatch,
  type LifecycleResult,
} from "@/lib/domain/inspection";
import { assessReadiness, canFinalise, type Readiness } from "@/lib/domain/readiness";
import type { ID, Inspection } from "@/lib/domain/types";
import { isInspection } from "@/lib/domain/validation";
import {
  INDEXES,
  INSPECTION_CHILD_STORES,
  STORES,
  requestToPromise,
  withTransaction,
  type InspectionChildStore,
} from "./db";
import { StorageError } from "./errors";
import { LOCKED_MESSAGE } from "./guards";

function notFound(id: ID): StorageError {
  return new StorageError("not_found", `Inspection ${id} was not found.`);
}

/** Saves a new inspection. Fails with `already_exists` rather than overwriting. */
export async function createInspection(inspection: Inspection): Promise<Inspection> {
  if (!isInspection(inspection)) {
    throw new StorageError("invalid_record", "The inspection record is invalid and was not saved.");
  }
  await withTransaction(
    STORES.inspections,
    "readwrite",
    async (tx) => {
      // `add` (unlike `put`) rejects an existing key with a ConstraintError.
      await requestToPromise(tx.objectStore(STORES.inspections).add(inspection));
    },
    "The inspection could not be saved.",
  );
  return inspection;
}

/** Returns the inspection, or `undefined` if none exists with that ID. */
export async function getInspection(id: ID): Promise<Inspection | undefined> {
  const record = await withTransaction(
    STORES.inspections,
    "readonly",
    (tx) => requestToPromise<unknown>(tx.objectStore(STORES.inspections).get(id)),
    "The inspection could not be loaded.",
  );
  if (record === undefined) return undefined;
  if (!isInspection(record)) {
    throw new StorageError("invalid_record", "The stored inspection record is damaged and cannot be displayed.");
  }
  return record;
}

/** A stored record that failed validation. It is reported, never modified. */
export interface DamagedRecord {
  /** The record's primary key, as text. */
  key: string;
}

export interface InspectionListResult {
  /** Valid inspections, most recently updated first. */
  inspections: Inspection[];
  /** Records that exist in storage but failed validation, in key order. */
  damaged: DamagedRecord[];
}

/**
 * Lists every inspection record. Damaged records are returned separately so
 * the UI can report them; they are not hidden, repaired or deleted.
 */
export async function listInspections(): Promise<InspectionListResult> {
  const { keys, records } = await withTransaction(
    STORES.inspections,
    "readonly",
    async (tx) => {
      const store = tx.objectStore(STORES.inspections);
      // Within one transaction both calls return entries in the same primary-key order.
      const [keys, records] = await Promise.all([
        requestToPromise(store.getAllKeys()),
        requestToPromise<unknown[]>(store.getAll()),
      ]);
      return { keys, records };
    },
    "Inspections could not be loaded.",
  );

  const inspections: Inspection[] = [];
  const damaged: DamagedRecord[] = [];
  records.forEach((record, index) => {
    if (isInspection(record)) inspections.push(record);
    else damaged.push({ key: String(keys[index]) });
  });

  inspections.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return { inspections, damaged };
}

/**
 * Applies a validated patch to an existing inspection. Read and write happen in
 * one transaction, so concurrent updates cannot interleave.
 */
export async function updateInspection(
  id: ID,
  patch: InspectionPatch,
  now: Date = new Date(),
): Promise<Inspection> {
  return withTransaction(
    STORES.inspections,
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.inspections);
      const existing = await requestToPromise<unknown>(store.get(id));
      if (existing === undefined) throw notFound(id);
      if (!isInspection(existing)) {
        throw new StorageError("invalid_record", "The stored inspection record is damaged and cannot be updated.");
      }
      // A finalised inspection only changes through `reopenInspection`.
      if (existing.status === "finalised") throw new StorageError("locked", LOCKED_MESSAGE);
      const updated = applyInspectionPatch(existing, patch, now);
      // Rejects e.g. a plain status patch to `finalised` (no finalisation metadata).
      if (!isInspection(updated)) {
        throw new StorageError("invalid_record", "The update would make the inspection invalid and was not saved.");
      }
      await requestToPromise(store.put(updated));
      return updated;
    },
    "The inspection could not be updated.",
  );
}

// ---- Review lifecycle -----------------------------------------------------

async function loadValidInspection(tx: IDBTransaction, id: ID): Promise<Inspection> {
  const existing = await requestToPromise<unknown>(tx.objectStore(STORES.inspections).get(id));
  if (existing === undefined) throw notFound(id);
  if (!isInspection(existing)) {
    throw new StorageError("invalid_record", "The stored inspection record is damaged and its status cannot be changed.");
  }
  return existing;
}

function applyTransition(result: LifecycleResult): Inspection {
  if (!result.ok) throw new StorageError("invalid_record", result.error);
  return result.value;
}

/** draft → in_review. */
export async function startInspectionReview(id: ID, now: Date = new Date()): Promise<Inspection> {
  return withTransaction(
    STORES.inspections,
    "readwrite",
    async (tx) => {
      const updated = applyTransition(startReviewTransition(await loadValidInspection(tx, id), now));
      await requestToPromise(tx.objectStore(STORES.inspections).put(updated));
      return updated;
    },
    "The inspection review could not be started.",
  );
}

/** Readiness from the stored findings, read in the given transaction (damaged records counted). */
async function readinessInTransaction(tx: IDBTransaction, inspectionId: ID): Promise<Readiness> {
  const records = await requestToPromise<unknown[]>(
    tx.objectStore(STORES.findings).index(INDEXES.byInspectionId).getAll(inspectionId),
  );
  const findings = records.filter(isFinding);
  return assessReadiness(findings, records.length - findings.length);
}

/** Current readiness, for display. Finalisation re-checks it inside its own transaction. */
export async function getInspectionReadiness(inspectionId: ID): Promise<Readiness> {
  return withTransaction(
    STORES.findings,
    "readonly",
    (tx) => readinessInTransaction(tx, inspectionId),
    "The inspection readiness could not be checked.",
  );
}

/**
 * in_review → finalised, recording the inspector and time. Readiness is
 * re-assessed from the stored findings inside this transaction (the UI's view
 * may be out of date): any blocker refuses finalisation, and warnings must be
 * acknowledged explicitly. Finalisation records that the documentation is
 * complete; it is not a structural safety or engineering assessment.
 */
export async function finaliseInspection(
  id: ID,
  options: { acknowledgeWarnings: boolean },
  now: Date = new Date(),
): Promise<Inspection> {
  return withTransaction(
    [STORES.inspections, STORES.findings],
    "readwrite",
    async (tx) => {
      const inspection = await loadValidInspection(tx, id);
      if (inspection.status !== "in_review") {
        throw new StorageError("invalid_record", "Only an inspection in review can be finalised.");
      }
      const readiness = await readinessInTransaction(tx, id);
      if (readiness.blocked) {
        throw new StorageError(
          "invalid_record",
          `The inspection cannot be finalised yet: ${readiness.blockers.map((b) => b.message).join(" ")}`,
        );
      }
      if (!canFinalise(readiness, options.acknowledgeWarnings)) {
        throw new StorageError(
          "invalid_record",
          `Acknowledge the documentation warnings to finalise: ${readiness.warnings.map((w) => w.message).join(" ")}`,
        );
      }
      const updated = applyTransition(finaliseInspectionRecord(inspection, inspection.inspectorName, now));
      await requestToPromise(tx.objectStore(STORES.inspections).put(updated));
      return updated;
    },
    "The inspection could not be finalised.",
  );
}

/** finalised → in_review: clears the finalisation and restores editing. All other data is kept. */
export async function reopenInspection(id: ID, now: Date = new Date()): Promise<Inspection> {
  return withTransaction(
    STORES.inspections,
    "readwrite",
    async (tx) => {
      const updated = applyTransition(reopenInspectionRecord(await loadValidInspection(tx, id), now));
      await requestToPromise(tx.objectStore(STORES.inspections).put(updated));
      return updated;
    },
    "The inspection could not be reopened.",
  );
}

export type DeletedCounts = Record<InspectionChildStore, number>;

/**
 * Deletes an inspection and every record that belongs to it (photos, image
 * data, annotations, findings) in a single transaction: either everything is
 * removed or nothing is.
 */
export async function deleteInspection(id: ID): Promise<DeletedCounts> {
  return withTransaction(
    [STORES.inspections, ...INSPECTION_CHILD_STORES],
    "readwrite",
    async (tx) => {
      const inspections = tx.objectStore(STORES.inspections);
      const existing = await requestToPromise(inspections.getKey(id));
      if (existing === undefined) throw notFound(id);

      const counts: DeletedCounts = { photos: 0, photoBlobs: 0, annotations: 0, findings: 0 };
      for (const storeName of INSPECTION_CHILD_STORES) {
        const store = tx.objectStore(storeName);
        const keys = await requestToPromise(store.index(INDEXES.byInspectionId).getAllKeys(id));
        await Promise.all(keys.map((key) => requestToPromise(store.delete(key))));
        counts[storeName] = keys.length;
      }

      await requestToPromise(inspections.delete(id));
      return counts;
    },
    "The inspection could not be deleted.",
  );
}
