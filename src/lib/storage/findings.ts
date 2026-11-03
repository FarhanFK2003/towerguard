import {
  applyFindingChanges,
  checkEvidenceRelations,
  isFinding,
  type FindingChanges,
} from "@/lib/domain/finding";
import type { EvidenceLink, Finding, ID } from "@/lib/domain/types";
import { INDEXES, STORES, requestToPromise, withTransaction } from "./db";
import { StorageError } from "./errors";
import type { DamagedRecord } from "./inspections";

const FINDING_STORES = [STORES.inspections, STORES.photos, STORES.annotations, STORES.findings] as const;

function findingNotFound(id: ID): StorageError {
  return new StorageError("not_found", `Finding ${id} was not found.`);
}

/** Loads the photographs and annotations a finding refers to, inside `tx`. */
async function loadEvidenceRecords(tx: IDBTransaction, evidence: readonly EvidenceLink[]) {
  const photoStore = tx.objectStore(STORES.photos);
  const annotationStore = tx.objectStore(STORES.annotations);
  const photoIds = evidence.map((l) => l.photoId);
  const annotationIds = evidence.flatMap((l) => l.annotationIds);
  const [photos, annotations] = await Promise.all([
    Promise.all(photoIds.map((id) => requestToPromise<unknown>(photoStore.get(id)))),
    Promise.all(annotationIds.map((id) => requestToPromise<unknown>(annotationStore.get(id)))),
  ]);
  return {
    photos: new Map(photoIds.map((id, i) => [id, photos[i]])),
    annotations: new Map(annotationIds.map((id, i) => [id, annotations[i]])),
  };
}

/** Rejects (inside the transaction) evidence that is missing or belongs elsewhere. */
async function assertEvidenceValid(tx: IDBTransaction, finding: Finding): Promise<void> {
  const problem = checkEvidenceRelations(finding.inspectionId, finding.evidence, await loadEvidenceRecords(tx, finding.evidence));
  if (problem) throw new StorageError("invalid_record", `${problem} The finding was not saved.`);
}

/**
 * Saves a new finding after checking, in the same transaction, that its
 * inspection exists and every evidence reference is valid. Never overwrites.
 */
export async function createFinding(finding: Finding): Promise<Finding> {
  if (!isFinding(finding)) throw new StorageError("invalid_record", "The finding is invalid and was not saved.");
  await withTransaction(
    FINDING_STORES,
    "readwrite",
    async (tx) => {
      if ((await requestToPromise(tx.objectStore(STORES.inspections).getKey(finding.inspectionId))) === undefined) {
        throw new StorageError("not_found", "The inspection no longer exists, so the finding was not saved.");
      }
      await assertEvidenceValid(tx, finding);
      await requestToPromise(tx.objectStore(STORES.findings).add(finding));
    },
    "The finding could not be saved.",
  );
  return finding;
}

export async function getFinding(id: ID): Promise<Finding | undefined> {
  const record = await withTransaction(
    STORES.findings,
    "readonly",
    (tx) => requestToPromise<unknown>(tx.objectStore(STORES.findings).get(id)),
    "The finding could not be loaded.",
  );
  if (record === undefined) return undefined;
  if (!isFinding(record)) throw new StorageError("invalid_record", "The stored finding is damaged and cannot be displayed.");
  return record;
}

export interface FindingListResult {
  /** Valid findings, newest first. */
  findings: Finding[];
  /** Records that failed validation (reported, never modified). */
  damaged: DamagedRecord[];
}

export async function listFindings(inspectionId: ID): Promise<FindingListResult> {
  const { keys, records } = await withTransaction(
    STORES.findings,
    "readonly",
    async (tx) => {
      const byInspection = tx.objectStore(STORES.findings).index(INDEXES.byInspectionId);
      // Same index and range, so both calls return entries in the same order.
      const [keys, records] = await Promise.all([
        requestToPromise(byInspection.getAllKeys(inspectionId)),
        requestToPromise<unknown[]>(byInspection.getAll(inspectionId)),
      ]);
      return { keys, records };
    },
    "Findings could not be loaded.",
  );
  const findings: Finding[] = [];
  const damaged: DamagedRecord[] = [];
  records.forEach((record, index) => {
    if (isFinding(record)) findings.push(record);
    else damaged.push({ key: String(keys[index]) });
  });
  findings.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? 1 : -1));
  return { findings, damaged };
}

/** Applies validated edits. Evidence is re-checked in the same transaction. */
export async function updateFinding(
  id: ID,
  changes: FindingChanges,
  reviewer: string,
  now: Date = new Date(),
): Promise<Finding> {
  return withTransaction(
    FINDING_STORES,
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.findings);
      const existing = await requestToPromise<unknown>(store.get(id));
      if (existing === undefined) throw findingNotFound(id);
      if (!isFinding(existing)) throw new StorageError("invalid_record", "The stored finding is damaged and cannot be updated.");
      const updated = applyFindingChanges(existing, changes, reviewer, now);
      if (!isFinding(updated)) throw new StorageError("invalid_record", "The change would make the finding invalid and was not saved.");
      await assertEvidenceValid(tx, updated);
      await requestToPromise(store.put(updated));
      return updated;
    },
    "The finding could not be updated.",
  );
}

/** Deletes the finding only; linked photographs and annotations are untouched. */
export async function deleteFinding(id: ID): Promise<void> {
  await withTransaction(
    STORES.findings,
    "readwrite",
    async (tx) => {
      const store = tx.objectStore(STORES.findings);
      if ((await requestToPromise(store.getKey(id))) === undefined) throw findingNotFound(id);
      await requestToPromise(store.delete(id));
    },
    "The finding could not be deleted.",
  );
}

/**
 * Evidence clean-up policy, run inside the transaction that deletes a
 * photograph or annotation (which must include the findings store): every
 * valid finding of the inspection has the deleted references removed and its
 * `updatedAt` bumped. Findings themselves are never deleted, and damaged
 * finding records are left untouched. Returns the number of findings changed.
 */
export async function pruneFindingEvidence(
  tx: IDBTransaction,
  inspectionId: ID,
  prune: (evidence: readonly EvidenceLink[]) => EvidenceLink[],
  now: Date = new Date(),
): Promise<number> {
  const store = tx.objectStore(STORES.findings);
  const records = await requestToPromise<unknown[]>(store.index(INDEXES.byInspectionId).getAll(inspectionId));
  let changed = 0;
  for (const record of records) {
    if (!isFinding(record)) continue;
    const evidence = prune(record.evidence);
    if (JSON.stringify(evidence) === JSON.stringify(record.evidence)) continue;
    await requestToPromise(store.put({ ...record, evidence, updatedAt: now.toISOString() }));
    changed += 1;
  }
  return changed;
}
