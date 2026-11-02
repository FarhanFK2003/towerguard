import { describe, expect, it } from "vitest";
import type { Annotation } from "@/lib/domain/types";
import {
  createAnnotation,
  deleteAnnotation,
  getAnnotation,
  listAnnotations,
  updateAnnotation,
} from "@/lib/storage/annotations";
import { STORES, closeDatabase, requestToPromise, withTransaction } from "@/lib/storage/db";
import { createInspection, deleteInspection } from "@/lib/storage/inspections";
import { addPhoto, deletePhoto } from "@/lib/storage/photos";
import { makeAnnotation, makeInspection, makeNewPhoto, setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

async function seedPhotos(): Promise<void> {
  await createInspection(makeInspection({ id: "insp-1" }));
  await createInspection(makeInspection({ id: "insp-2" }));
  await addPhoto(makeNewPhoto({ id: "photo-1", inspectionId: "insp-1", sha256: "1".repeat(64) }));
  await addPhoto(makeNewPhoto({ id: "photo-2", inspectionId: "insp-1", sha256: "2".repeat(64) }));
  await addPhoto(makeNewPhoto({ id: "photo-3", inspectionId: "insp-2", sha256: "3".repeat(64) }));
}

function putRaw(record: object): Promise<void> {
  return withTransaction(STORES.annotations, "readwrite", async (tx) => {
    await requestToPromise(tx.objectStore(STORES.annotations).put(record));
  });
}

function countAnnotations(): Promise<number> {
  return withTransaction(STORES.annotations, "readonly", (tx) => requestToPromise(tx.objectStore(STORES.annotations).count()));
}

describe("createAnnotation", () => {
  it("stores an annotation with every required field", async () => {
    await seedPhotos();
    const annotation = makeAnnotation({ label: "corrosion" });
    await createAnnotation(annotation);
    const stored = await getAnnotation("ann-1");
    expect(stored).toEqual(annotation);
    expect(stored).toMatchObject({ id: "ann-1", inspectionId: "insp-1", photoId: "photo-1", provenance: { source: "manual" } });
  });

  it("refuses annotations for a missing photograph", async () => {
    await seedPhotos();
    await expect(createAnnotation(makeAnnotation({ photoId: "gone" }))).rejects.toMatchObject({ code: "not_found" });
    expect(await countAnnotations()).toBe(0);
  });

  it("refuses an annotation whose inspection does not match its photograph", async () => {
    await seedPhotos();
    await expect(createAnnotation(makeAnnotation({ photoId: "photo-3", inspectionId: "insp-1" }))).rejects.toMatchObject({
      code: "invalid_record",
    });
  });

  it("rejects malformed shapes without writing", async () => {
    await seedPhotos();
    const bad = makeAnnotation({ shape: { kind: "rect", x: 0.8, y: 0.8, width: 0.5, height: 0.5 } });
    await expect(createAnnotation(bad)).rejects.toMatchObject({ code: "invalid_record" });
    expect(await countAnnotations()).toBe(0);
  });

  it("never overwrites an existing annotation with the same ID", async () => {
    await seedPhotos();
    const first = makeAnnotation();
    await createAnnotation(first);
    await expect(createAnnotation(makeAnnotation({ label: "other" }))).rejects.toMatchObject({ code: "already_exists" });
    await expect(getAnnotation("ann-1")).resolves.toEqual(first);
  });
});

describe("listAnnotations", () => {
  it("lists only the photograph's annotations, oldest first", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation({ id: "b", createdAt: "2026-10-30T11:00:00.000Z", updatedAt: "2026-10-30T11:00:00.000Z" }));
    await createAnnotation(makeAnnotation({ id: "a", createdAt: "2026-10-30T10:00:00.000Z" }));
    await createAnnotation(makeAnnotation({ id: "other-photo", photoId: "photo-2" }));
    const result = await listAnnotations("photo-1");
    expect(result.annotations.map((a) => a.id)).toEqual(["a", "b"]);
    expect(result.damaged).toEqual([]);
  });

  it("reports damaged records without modifying them", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation());
    const damaged = { id: "broken", photoId: "photo-1", shape: { kind: "rect", x: 2 } };
    await putRaw(damaged);
    const result = await listAnnotations("photo-1");
    expect(result.annotations.map((a) => a.id)).toEqual(["ann-1"]);
    expect(result.damaged).toEqual([{ key: "broken" }]);
    expect(await withTransaction(STORES.annotations, "readonly", (tx) => requestToPromise(tx.objectStore(STORES.annotations).get("broken")))).toEqual(damaged);
  });

  it("persists across a closed and reopened database connection", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation());
    await closeDatabase();
    expect((await listAnnotations("photo-1")).annotations).toHaveLength(1);
  });
});

describe("updateAnnotation", () => {
  it("updates shape and label and bumps updatedAt", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation());
    const now = new Date("2026-11-02T12:00:00.000Z");
    const updated = await updateAnnotation("ann-1", { shape: { kind: "rect", x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, label: "deformation" }, now);
    expect(updated.shape).toEqual({ kind: "rect", x: 0.5, y: 0.5, width: 0.2, height: 0.2 });
    expect(updated.label).toBe("deformation");
    expect(updated.updatedAt).toBe(now.toISOString());
    await expect(getAnnotation("ann-1")).resolves.toEqual(updated);
  });

  it("rejects a shape outside the image and keeps the stored annotation", async () => {
    await seedPhotos();
    const original = makeAnnotation();
    await createAnnotation(original);
    await expect(updateAnnotation("ann-1", { shape: { kind: "point", x: 1.5, y: 0.5 } })).rejects.toMatchObject({ code: "invalid_record" });
    await expect(getAnnotation("ann-1")).resolves.toEqual(original);
  });

  it("fails with not_found for unknown annotations", async () => {
    await expect(updateAnnotation("missing", { label: "other" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleting annotations", () => {
  it("deletes one annotation and leaves the others", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation({ id: "keep" }));
    await createAnnotation(makeAnnotation({ id: "remove" }));
    await deleteAnnotation("remove");
    expect((await listAnnotations("photo-1")).annotations.map((a: Annotation) => a.id)).toEqual(["keep"]);
  });

  it("fails with not_found for unknown annotations", async () => {
    await expect(deleteAnnotation("missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("deleting a photograph deletes its annotations only", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation({ id: "on-1a" }));
    await createAnnotation(makeAnnotation({ id: "on-1b", shape: { kind: "point", x: 0.3, y: 0.3 } }));
    await createAnnotation(makeAnnotation({ id: "on-2", photoId: "photo-2" }));
    await deletePhoto("photo-1");
    expect((await listAnnotations("photo-1")).annotations).toEqual([]);
    expect((await listAnnotations("photo-2")).annotations.map((a) => a.id)).toEqual(["on-2"]);
  });

  it("deleting an inspection deletes its annotations", async () => {
    await seedPhotos();
    await createAnnotation(makeAnnotation());
    await createAnnotation(makeAnnotation({ id: "other", inspectionId: "insp-2", photoId: "photo-3" }));
    await expect(deleteInspection("insp-1")).resolves.toMatchObject({ annotations: 1 });
    expect(await countAnnotations()).toBe(1);
  });
});
