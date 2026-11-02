import type { FindingStatus } from "@/lib/domain/constants";
import { STORES, requestToPromise, withTransaction } from "./db";

export interface WorkspaceSummary {
  inspections: number;
  photos: number;
  observations: number;
  confirmedFindings: number;
}

function hasStatus(record: unknown, status: FindingStatus): boolean {
  return (
    typeof record === "object" &&
    record !== null &&
    (record as { status?: unknown }).status === status
  );
}

/** Record counts across all inspections, read in one consistent snapshot. */
export async function getWorkspaceSummary(): Promise<WorkspaceSummary> {
  return withTransaction(
    [STORES.inspections, STORES.photos, STORES.findings],
    "readonly",
    async (tx) => {
      const [inspections, photos, findings] = await Promise.all([
        requestToPromise(tx.objectStore(STORES.inspections).count()),
        requestToPromise(tx.objectStore(STORES.photos).count()),
        requestToPromise<unknown[]>(tx.objectStore(STORES.findings).getAll()),
      ]);
      return {
        inspections,
        photos,
        observations: findings.filter((f) => hasStatus(f, "observation")).length,
        confirmedFindings: findings.filter((f) => hasStatus(f, "confirmed")).length,
      };
    },
    "The workspace summary could not be loaded.",
  );
}
