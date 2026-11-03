import type { ID } from "@/lib/domain/types";
import { STORES, requestToPromise } from "./db";
import { StorageError } from "./errors";

export const LOCKED_MESSAGE = "This inspection is finalised and read-only. Reopen it to make changes.";

/**
 * Finalisation lock. Call inside the same read-write transaction as the
 * change (the transaction must include the inspections store), before any
 * write, so the check and the writes are atomic: if the inspection is
 * finalised the transaction aborts and nothing is changed.
 *
 * Reads the raw record so even a damaged record marked finalised stays locked.
 */
export async function assertInspectionEditable(
  tx: IDBTransaction,
  inspectionId: ID,
  /** Deletes may clean up records whose inspection no longer exists. */
  options: { allowMissing?: boolean } = {},
): Promise<void> {
  const record = await requestToPromise<unknown>(tx.objectStore(STORES.inspections).get(inspectionId));
  if (record === undefined) {
    if (options.allowMissing) return;
    throw new StorageError("not_found", "The inspection no longer exists, so the change was not saved.");
  }
  if ((record as { status?: unknown }).status === "finalised") {
    throw new StorageError("locked", LOCKED_MESSAGE);
  }
}
