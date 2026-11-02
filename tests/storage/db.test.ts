import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DB_NAME,
  DB_VERSION,
  INDEXES,
  STORES,
  closeDatabase,
  getDatabase,
  openDatabase,
} from "@/lib/storage/db";
import { StorageError } from "@/lib/storage/errors";
import { setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

function indexNames(db: IDBDatabase, store: string): string[] {
  const tx = db.transaction(store, "readonly");
  return [...tx.objectStore(store).indexNames].sort();
}

describe("database initialisation", () => {
  it("creates every store with its relationship indexes", async () => {
    const db = await getDatabase();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(Object.values(STORES).sort());

    expect(indexNames(db, STORES.inspections)).toEqual([INDEXES.byUpdatedAt]);
    expect(indexNames(db, STORES.photos)).toEqual([INDEXES.byInspectionId]);
    expect(indexNames(db, STORES.photoBlobs)).toEqual([INDEXES.byInspectionId]);
    expect(indexNames(db, STORES.annotations)).toEqual(
      [INDEXES.byInspectionId, INDEXES.byPhotoId].sort(),
    );
    expect(indexNames(db, STORES.findings)).toEqual([INDEXES.byInspectionId]);
  });

  it("uses the expected key paths", async () => {
    const db = await getDatabase();
    const tx = db.transaction([STORES.inspections, STORES.photoBlobs], "readonly");
    expect(tx.objectStore(STORES.inspections).keyPath).toBe("id");
    expect(tx.objectStore(STORES.photoBlobs).keyPath).toBe("photoId");
  });

  it("reuses one shared connection", async () => {
    expect(await getDatabase()).toBe(await getDatabase());
  });
});

describe("database open errors", () => {
  afterEach(async () => {
    await closeDatabase();
  });

  it("reports IndexedDB as unavailable when the browser has none", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(openDatabase()).rejects.toMatchObject({ code: "unavailable" });
  });

  it("wraps a factory that throws", async () => {
    const factory = {
      open: () => {
        throw new Error("SecurityError");
      },
    } as unknown as IDBFactory;
    const error = await openDatabase({ factory }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: "open_failed" });
  });

  it("explains when the stored database is newer than the app", async () => {
    const factory = new IDBFactory();
    (await openDatabase({ factory, version: DB_VERSION + 1 })).close();
    await expect(openDatabase({ factory })).rejects.toMatchObject({
      code: "open_failed",
      message: expect.stringContaining("newer version"),
    });
  });

  it("reports a blocked upgrade while another connection stays open", async () => {
    const factory = new IDBFactory();
    const old = await openDatabase({ factory });
    await expect(openDatabase({ factory, version: DB_VERSION + 1 })).rejects.toMatchObject({
      code: "blocked",
    });
    old.close();
  });

  it("does not cache a failed open, so a later call can succeed", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(getDatabase()).rejects.toMatchObject({ code: "unavailable" });

    vi.stubGlobal("indexedDB", new IDBFactory());
    await expect(getDatabase()).resolves.toBeDefined();
  });
});
