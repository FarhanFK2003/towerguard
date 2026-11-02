import { StorageError, toStorageError } from "./errors";

export const DB_NAME = "towerguard";
export const DB_VERSION = 1;

export const STORES = {
  inspections: "inspections",
  photos: "photos",
  photoBlobs: "photoBlobs",
  annotations: "annotations",
  findings: "findings",
} as const;
export type StoreName = (typeof STORES)[keyof typeof STORES];

export const INDEXES = {
  byInspectionId: "by_inspectionId",
  byPhotoId: "by_photoId",
  byUpdatedAt: "by_updatedAt",
} as const;

/** Stores holding records that belong to an inspection (all indexed by inspectionId). */
export const INSPECTION_CHILD_STORES = [
  STORES.photos,
  STORES.photoBlobs,
  STORES.annotations,
  STORES.findings,
] as const;
export type InspectionChildStore = (typeof INSPECTION_CHILD_STORES)[number];

/**
 * Schema migrations, applied in order. Add a new `if (oldVersion < N)` block
 * and bump {@link DB_VERSION} for every schema change; never edit old blocks.
 */
function upgradeSchema(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const inspections = db.createObjectStore(STORES.inspections, { keyPath: "id" });
    inspections.createIndex(INDEXES.byUpdatedAt, "updatedAt");

    const photos = db.createObjectStore(STORES.photos, { keyPath: "id" });
    photos.createIndex(INDEXES.byInspectionId, "inspectionId");

    const photoBlobs = db.createObjectStore(STORES.photoBlobs, { keyPath: "photoId" });
    photoBlobs.createIndex(INDEXES.byInspectionId, "inspectionId");

    const annotations = db.createObjectStore(STORES.annotations, { keyPath: "id" });
    annotations.createIndex(INDEXES.byInspectionId, "inspectionId");
    annotations.createIndex(INDEXES.byPhotoId, "photoId");

    const findings = db.createObjectStore(STORES.findings, { keyPath: "id" });
    findings.createIndex(INDEXES.byInspectionId, "inspectionId");
  }
}

export interface OpenDatabaseOptions {
  /** Defaults to the global `indexedDB`. */
  factory?: IDBFactory;
  name?: string;
  version?: number;
}

/** Opens (and if needed creates or migrates) the database. */
export function openDatabase(options: OpenDatabaseOptions = {}): Promise<IDBDatabase> {
  const { name = DB_NAME, version = DB_VERSION } = options;

  return new Promise<IDBDatabase>((resolve, reject) => {
    const factory = options.factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (!factory) {
      reject(
        new StorageError(
          "unavailable",
          "This browser does not support IndexedDB, or it is disabled (for example in some private browsing modes).",
        ),
      );
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, version);
    } catch (error) {
      reject(new StorageError("open_failed", "The local database could not be opened.", { cause: error }));
      return;
    }

    let settled = false;

    request.onupgradeneeded = (event) => {
      try {
        upgradeSchema(request.result, event.oldVersion);
      } catch (error) {
        // Aborting the version-change transaction makes the open request fail.
        settled = true;
        reject(new StorageError("open_failed", "The local database could not be upgraded.", { cause: error }));
        request.transaction?.abort();
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        // We already reported failure (e.g. blocked); don't leak the connection.
        db.close();
        return;
      }
      settled = true;
      resolve(db);
    };

    request.onerror = (event) => {
      event.preventDefault();
      if (settled) return;
      settled = true;
      const message =
        request.error?.name === "VersionError"
          ? "The local database was created by a newer version of TowerGuard. Update the app or clear site data."
          : "The local database could not be opened.";
      reject(new StorageError("open_failed", message, { cause: request.error }));
    };

    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(
        new StorageError(
          "blocked",
          "The database upgrade is blocked by another open TowerGuard tab. Close other tabs and reload.",
        ),
      );
    };
  });
}

let connection: Promise<IDBDatabase> | null = null;

/** Shared connection, opened lazily. A failed open is not cached, so it can be retried. */
export function getDatabase(): Promise<IDBDatabase> {
  if (!connection) {
    const pending = openDatabase().then(
      (db) => {
        // Another tab wants to upgrade: release our connection so it isn't blocked.
        db.onversionchange = () => {
          db.close();
          if (connection === pending) connection = null;
        };
        db.onclose = () => {
          if (connection === pending) connection = null;
        };
        return db;
      },
      (error: unknown) => {
        if (connection === pending) connection = null;
        throw error;
      },
    );
    connection = pending;
  }
  return connection;
}

/** Closes the shared connection (used by tests and before deleting the database). */
export async function closeDatabase(): Promise<void> {
  const pending = connection;
  connection = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // Opening failed; nothing to close.
  }
}

/** Wraps a single IDBRequest in a promise. */
export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new StorageError("transaction_failed", "The database transaction was aborted."));
  });
}

/**
 * Runs `work` inside one transaction and resolves only after the transaction
 * has committed. If `work` throws, the transaction is aborted so no partial
 * changes are kept.
 *
 * `work` must only await IndexedDB requests from `tx`; awaiting unrelated
 * promises lets the transaction auto-commit early.
 */
export async function withTransaction<T>(
  stores: StoreName | readonly StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
  failureMessage = "The local database operation failed.",
): Promise<T> {
  const db = await getDatabase();

  let tx: IDBTransaction;
  try {
    tx = db.transaction(typeof stores === "string" ? stores : [...stores], mode);
  } catch (error) {
    throw toStorageError(error, failureMessage);
  }

  const done = transactionDone(tx);
  // Observe rejection immediately; it is re-awaited below.
  done.catch(() => undefined);

  try {
    const result = await work(tx);
    await done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Already committed or aborted.
    }
    throw toStorageError(error, failureMessage);
  }
}
