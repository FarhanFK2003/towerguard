import { describe, expect, it } from "vitest";
import type { PhotoRecord } from "@/lib/domain/types";
import { STORES, requestToPromise, withTransaction, type StoreName } from "@/lib/storage/db";
import { StorageError } from "@/lib/storage/errors";
import { createInspection, deleteInspection } from "@/lib/storage/inspections";
import {
  addPhoto,
  deletePhoto,
  deletePhotosForInspection,
  getPhoto,
  getPhotoOriginal,
  getPhotoThumbnail,
  listPhotos,
  updatePhotoDetails,
} from "@/lib/storage/photos";
import { getWorkspaceSummary } from "@/lib/storage/workspace";
import { blobBytes, makeInspection, makeNewPhoto, setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

function putRaw(store: StoreName, record: object): Promise<void> {
  return withTransaction(store, "readwrite", async (tx) => {
    await requestToPromise(tx.objectStore(store).put(record));
  });
}

function getRaw(store: StoreName, key: string): Promise<unknown> {
  return withTransaction(store, "readonly", (tx) => requestToPromise<unknown>(tx.objectStore(store).get(key)));
}

function count(store: StoreName): Promise<number> {
  return withTransaction(store, "readonly", (tx) => requestToPromise(tx.objectStore(store).count()));
}

const sha = (char: string) => char.repeat(64);

describe("addPhoto and retrieval", () => {
  it("stores metadata and both images, retrievable byte-for-byte", async () => {
    await createInspection(makeInspection());
    const photo = makeNewPhoto();

    await addPhoto(photo);

    await expect(getPhoto("photo-1")).resolves.toEqual(photo.record);
    expect(await blobBytes(await getPhotoOriginal("photo-1"))).toEqual(await blobBytes(photo.original));
    expect(await blobBytes(await getPhotoThumbnail("photo-1"))).toEqual(await blobBytes(photo.thumbnail));
    expect((await getPhotoOriginal("photo-1"))?.type).toBe("image/jpeg");
  });

  it("stores metadata and image data in separate records", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto());
    const metadata = await getRaw(STORES.photos, "photo-1");
    expect(Object.values(metadata as object).some((v) => v instanceof Blob)).toBe(false);
    expect(await getRaw(STORES.photoBlobs, "photo-1")).toMatchObject({ photoId: "photo-1", inspectionId: "insp-1" });
  });

  it("returns undefined for unknown photographs", async () => {
    await expect(getPhoto("missing")).resolves.toBeUndefined();
    await expect(getPhotoOriginal("missing")).resolves.toBeUndefined();
  });

  it("refuses photographs for an inspection that does not exist", async () => {
    await expect(addPhoto(makeNewPhoto({ inspectionId: "gone" }))).rejects.toMatchObject({ code: "not_found" });
    expect(await count(STORES.photos)).toBe(0);
    expect(await count(STORES.photoBlobs)).toBe(0);
  });

  it("rejects invalid metadata without writing anything", async () => {
    await createInspection(makeInspection());
    const bad = makeNewPhoto();
    (bad.record as unknown as Record<string, unknown>).sha256 = "not-a-hash";
    await expect(addPhoto(bad)).rejects.toMatchObject({ code: "invalid_record" });
    expect(await count(STORES.photos)).toBe(0);
  });
});

describe("no silent replacement", () => {
  it("refuses a second photo with the same ID and keeps the first unchanged", async () => {
    await createInspection(makeInspection());
    const first = makeNewPhoto({ sha256: sha("1") });
    await addPhoto(first);

    const error = await addPhoto(makeNewPhoto({ sha256: sha("2"), fileName: "other.jpg" })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: "already_exists" });
    await expect(getPhoto("photo-1")).resolves.toEqual(first.record);
  });

  it("refuses the same file (same SHA-256) twice in one inspection", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto({ id: "a", sha256: sha("c") }));
    await expect(addPhoto(makeNewPhoto({ id: "b", sha256: sha("c") }))).rejects.toMatchObject({
      code: "already_exists",
      message: expect.stringContaining('already attached to the inspection as "north-face.jpg"'),
    });
    expect(await count(STORES.photos)).toBe(1);
  });

  it("allows the same file in a different inspection", async () => {
    await createInspection(makeInspection({ id: "i1" }));
    await createInspection(makeInspection({ id: "i2" }));
    await addPhoto(makeNewPhoto({ id: "a", inspectionId: "i1" }));
    await expect(addPhoto(makeNewPhoto({ id: "b", inspectionId: "i2" }))).resolves.toBeDefined();
  });
});

describe("transaction integrity", () => {
  it("rolls back the metadata when storing the image data fails", async () => {
    await createInspection(makeInspection());
    // An orphaned image record with the same key makes the second write fail.
    await putRaw(STORES.photoBlobs, { photoId: "photo-1", inspectionId: "insp-1", note: "orphan" });

    await expect(addPhoto(makeNewPhoto())).rejects.toMatchObject({ code: "already_exists" });

    await expect(getPhoto("photo-1")).resolves.toBeUndefined();
    expect(await getRaw(STORES.photoBlobs, "photo-1")).toEqual({
      photoId: "photo-1",
      inspectionId: "insp-1",
      note: "orphan",
    });
  });
});

describe("listPhotos", () => {
  it("lists only the inspection's photographs, oldest first", async () => {
    await createInspection(makeInspection({ id: "i1" }));
    await createInspection(makeInspection({ id: "i2" }));
    await addPhoto(makeNewPhoto({ id: "late", inspectionId: "i1", sha256: sha("1"), uploadedAt: "2026-10-30T11:00:00.000Z" }));
    await addPhoto(makeNewPhoto({ id: "early", inspectionId: "i1", sha256: sha("2"), uploadedAt: "2026-10-30T10:00:00.000Z" }));
    await addPhoto(makeNewPhoto({ id: "other", inspectionId: "i2", sha256: sha("3") }));

    const result = await listPhotos("i1");

    expect(result.photos.map((p) => p.id)).toEqual(["early", "late"]);
    expect(result.damaged).toEqual([]);
    expect(result.missingImageIds).toEqual([]);
  });

  it("returns empty results for an inspection without photographs", async () => {
    await expect(listPhotos("none")).resolves.toEqual({ photos: [], damaged: [], missingImageIds: [] });
  });

  it("reports damaged metadata and photos with missing image data, without changing them", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto({ id: "ok", sha256: sha("1") }));
    const orphanMetadata: PhotoRecord = { ...makeNewPhoto({ id: "no-image", sha256: sha("2") }).record };
    await putRaw(STORES.photos, orphanMetadata);
    const damaged = { id: "broken", inspectionId: "insp-1", fileName: 7 };
    await putRaw(STORES.photos, damaged);

    const result = await listPhotos("insp-1");

    expect(result.photos.map((p) => p.id).sort()).toEqual(["no-image", "ok"]);
    expect(result.damaged).toEqual([{ key: "broken" }]);
    expect(result.missingImageIds).toEqual(["no-image"]);
    expect(await getRaw(STORES.photos, "broken")).toEqual(damaged);
  });
});

describe("damaged or missing image data", () => {
  it("returns undefined when the image record is missing", async () => {
    await createInspection(makeInspection());
    await putRaw(STORES.photos, makeNewPhoto().record);
    await expect(getPhotoThumbnail("photo-1")).resolves.toBeUndefined();
  });

  it("reports damaged image records instead of returning them", async () => {
    await putRaw(STORES.photoBlobs, { photoId: "p", inspectionId: "i", original: "not a blob" });
    await expect(getPhotoOriginal("p")).rejects.toMatchObject({ code: "invalid_record" });
  });

  it("reports damaged metadata instead of returning it", async () => {
    await putRaw(STORES.photos, { id: "p", inspectionId: "i" });
    await expect(getPhoto("p")).rejects.toMatchObject({ code: "invalid_record" });
  });
});

describe("updatePhotoDetails", () => {
  it("persists caption and viewpoint without touching image data or hash", async () => {
    await createInspection(makeInspection());
    const photo = makeNewPhoto();
    await addPhoto(photo);
    const now = new Date("2026-11-02T12:00:00.000Z");

    const updated = await updatePhotoDetails("photo-1", { caption: "Corrosion at bolt line", viewpoint: "Leg B" }, now);

    expect(updated).toEqual({ ...photo.record, caption: "Corrosion at bolt line", viewpoint: "Leg B", updatedAt: now.toISOString() });
    await expect(getPhoto("photo-1")).resolves.toEqual(updated);
    expect(await blobBytes(await getPhotoOriginal("photo-1"))).toEqual(await blobBytes(photo.original));
  });

  it("clears a field set to undefined", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto({ caption: "Old" }));
    const updated = await updatePhotoDetails("photo-1", { caption: undefined });
    expect(updated.caption).toBeUndefined();
  });

  it("fails with not_found for unknown photographs", async () => {
    await expect(updatePhotoDetails("missing", { caption: "x" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deletePhoto", () => {
  it("removes metadata, image data and annotations, leaving other photographs untouched", async () => {
    await createInspection(makeInspection());
    const keep = makeNewPhoto({ id: "keep", sha256: sha("1") });
    await addPhoto(keep);
    await addPhoto(makeNewPhoto({ id: "remove", sha256: sha("2") }));
    await putRaw(STORES.annotations, { id: "ann-remove", inspectionId: "insp-1", photoId: "remove" });
    await putRaw(STORES.annotations, { id: "ann-keep", inspectionId: "insp-1", photoId: "keep" });

    await deletePhoto("remove");

    await expect(getPhoto("remove")).resolves.toBeUndefined();
    await expect(getRaw(STORES.photoBlobs, "remove")).resolves.toBeUndefined();
    await expect(getRaw(STORES.annotations, "ann-remove")).resolves.toBeUndefined();
    await expect(getPhoto("keep")).resolves.toEqual(keep.record);
    expect(await blobBytes(await getPhotoOriginal("keep"))).toEqual(await blobBytes(keep.original));
    await expect(getRaw(STORES.annotations, "ann-keep")).resolves.toBeDefined();
  });

  it("fails with not_found and changes nothing for unknown photographs", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto());
    await expect(deletePhoto("missing")).rejects.toMatchObject({ code: "not_found" });
    expect(await count(STORES.photos)).toBe(1);
    expect(await count(STORES.photoBlobs)).toBe(1);
  });
});

describe("deleting photographs with their inspection", () => {
  it("deletePhotosForInspection removes only that inspection's photographs", async () => {
    await createInspection(makeInspection({ id: "i1" }));
    await createInspection(makeInspection({ id: "i2" }));
    await addPhoto(makeNewPhoto({ id: "a", inspectionId: "i1", sha256: sha("1") }));
    await addPhoto(makeNewPhoto({ id: "b", inspectionId: "i1", sha256: sha("2") }));
    await addPhoto(makeNewPhoto({ id: "c", inspectionId: "i2", sha256: sha("3") }));

    await expect(deletePhotosForInspection("i1")).resolves.toBe(2);

    expect((await listPhotos("i1")).photos).toEqual([]);
    expect((await listPhotos("i2")).photos.map((p) => p.id)).toEqual(["c"]);
    expect(await count(STORES.photoBlobs)).toBe(1);
  });

  it("deleteInspection removes its photographs and image data too", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto());
    await expect(deleteInspection("insp-1")).resolves.toMatchObject({ photos: 1, photoBlobs: 1 });
    expect(await count(STORES.photos)).toBe(0);
    expect(await count(STORES.photoBlobs)).toBe(0);
  });

  it("the workspace summary counts stored photographs", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto({ id: "a", sha256: sha("1") }));
    await addPhoto(makeNewPhoto({ id: "b", sha256: sha("2") }));
    await expect(getWorkspaceSummary()).resolves.toMatchObject({ photos: 2 });
  });
});
