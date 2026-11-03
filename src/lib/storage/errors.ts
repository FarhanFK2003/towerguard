export type StorageErrorCode =
  | "unavailable"
  | "open_failed"
  | "blocked"
  | "not_found"
  | "already_exists"
  | "invalid_record"
  | "quota_exceeded"
  | "transaction_failed"
  /** The inspection is finalised and read-only. */
  | "locked";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageError";
    this.code = code;
  }
}

function errorName(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "name" in error) {
    const { name } = error as { name: unknown };
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

/**
 * Normalises IndexedDB failures (DOMException names) into {@link StorageError}.
 * Existing StorageErrors pass through unchanged.
 */
export function toStorageError(error: unknown, fallbackMessage: string): StorageError {
  if (error instanceof StorageError) return error;
  switch (errorName(error)) {
    case "ConstraintError":
      return new StorageError(
        "already_exists",
        "A record with this ID already exists. Nothing was overwritten.",
        { cause: error },
      );
    case "QuotaExceededError":
      return new StorageError(
        "quota_exceeded",
        "Browser storage is full. Free up space or export and remove old inspections.",
        { cause: error },
      );
    default:
      return new StorageError("transaction_failed", fallbackMessage, { cause: error });
  }
}

/** A message suitable for showing to the user. */
export function describeStorageError(error: unknown): string {
  if (error instanceof StorageError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "An unexpected storage error occurred.";
}
