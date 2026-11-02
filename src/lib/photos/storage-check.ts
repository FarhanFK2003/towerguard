import { formatBytes } from "@/lib/format";
import { PhotoError } from "./errors";

/** Headroom for thumbnails, metadata and IndexedDB overhead. */
const OVERHEAD_FACTOR = 1.1;
const OVERHEAD_BYTES = 2 * 1024 * 1024;

/** Bytes to reserve when storing photographs with these original sizes. */
export function estimateRequiredBytes(fileSizes: readonly number[]): number {
  const total = fileSizes.reduce((sum, size) => sum + size, 0);
  return Math.ceil(total * OVERHEAD_FACTOR) + OVERHEAD_BYTES;
}

/**
 * Throws when the estimate shows too little free space. Browser estimates are
 * approximate, so quota errors during saving must still be handled.
 */
export function assertStorageAvailable(
  requiredBytes: number,
  estimate: { usage?: number; quota?: number } | undefined,
): void {
  if (!estimate?.quota) return; // Unknown quota: rely on the save failing cleanly.
  const available = Math.max(0, estimate.quota - (estimate.usage ?? 0));
  if (requiredBytes > available) {
    throw new PhotoError(
      "insufficient_storage",
      `Not enough browser storage: these photographs need about ${formatBytes(requiredBytes)}, but only ${formatBytes(available)} is available. Nothing was uploaded and no existing photographs were removed.`,
    );
  }
}

/** Reads the browser's storage estimate, or `undefined` where unsupported. */
export async function readStorageEstimate(): Promise<StorageEstimate | undefined> {
  try {
    return await navigator.storage?.estimate?.();
  } catch {
    return undefined;
  }
}
