import { describe, expect, it } from "vitest";
import { createAnnotation } from "@/lib/storage/annotations";
import { STORES, requestToPromise, withTransaction, type StoreName } from "@/lib/storage/db";
import { createFinding } from "@/lib/storage/findings";
import { createInspection } from "@/lib/storage/inspections";
import { addPhoto } from "@/lib/storage/photos";
import { readInspectionSnapshot } from "@/lib/storage/snapshot";
import { makeAnnotation, makeFinding, makeInspection, makeNewPhoto, setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

function putRaw(store: StoreName, record: object): Promise<void> {
  return withTransaction(store, "readwrite", async (tx) => {
    await requestToPromise(tx.objectStore(store).put(record));
  });
}

async function snapshotAll(): Promise<string> {
  const stores = Object.values(STORES);
  const all = await withTransaction(stores, "readonly", (tx) =>
    Promise.all(stores.map((s) => requestToPromise<unknown[]>(tx.objectStore(s).getAll()))),
  );
  return JSON.stringify(all, (_k, v: unknown) => (v instanceof Blob ? `Blob(${v.size})` : v));
}

describe("readInspectionSnapshot", () => {
  it("returns the inspection and its records in chronological order", async () => {
    await createInspection(makeInspection({ id: "insp-1" }));
    await createInspection(makeInspection({ id: "other" }));
    await addPhoto(makeNewPhoto({ id: "p2", sha256: "2".repeat(64), uploadedAt: "2026-10-30T10:00:00.000Z" }));
    await addPhoto(makeNewPhoto({ id: "p1", sha256: "1".repeat(64), uploadedAt: "2026-10-30T09:00:00.000Z" }));
    await addPhoto(makeNewPhoto({ id: "px", inspectionId: "other", sha256: "9".repeat(64) }));
    await createAnnotation(makeAnnotation({ id: "a2", photoId: "p1", createdAt: "2026-10-30T11:00:00.000Z", updatedAt: "2026-10-30T11:00:00.000Z" }));
    await createAnnotation(makeAnnotation({ id: "a1", photoId: "p1" }));
    await createFinding(makeFinding({ id: "f1", evidence: [{ photoId: "p1", annotationIds: ["a1"] }] }));

    const snapshot = await readInspectionSnapshot("insp-1");

    expect(snapshot?.inspection.id).toBe("insp-1");
    expect(snapshot?.photos.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(snapshot?.annotations.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(snapshot?.findings.map((f) => f.id)).toEqual(["f1"]);
    expect(snapshot?.missingImageIds).toEqual([]);
  });

  it("reports damaged records and missing image data instead of dropping them", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto({ id: "p1", sha256: "1".repeat(64) }));
    await putRaw(STORES.photos, { ...makeNewPhoto({ id: "no-image", sha256: "2".repeat(64) }).record });
    await putRaw(STORES.photos, { id: "bad-photo", inspectionId: "insp-1" });
    await putRaw(STORES.annotations, { id: "bad-ann", inspectionId: "insp-1", photoId: "p1", shape: { kind: "rect", x: 5 } });
    await putRaw(STORES.findings, { id: "bad-finding", inspectionId: "insp-1", title: 7 });

    const snapshot = await readInspectionSnapshot("insp-1");

    expect(snapshot?.missingImageIds).toEqual(["no-image"]);
    expect(snapshot?.damagedPhotos).toEqual([{ key: "bad-photo" }]);
    expect(snapshot?.damagedAnnotations).toEqual([{ key: "bad-ann" }]);
    expect(snapshot?.damagedFindings).toEqual([{ key: "bad-finding" }]);
  });

  it("returns undefined for an unknown inspection and refuses a damaged one", async () => {
    await expect(readInspectionSnapshot("missing")).resolves.toBeUndefined();
    await putRaw(STORES.inspections, { id: "broken" });
    await expect(readInspectionSnapshot("broken")).rejects.toMatchObject({ code: "invalid_record" });
  });

  it("is read-only: the database is byte-identical afterwards", async () => {
    await createInspection(makeInspection());
    await addPhoto(makeNewPhoto());
    const before = await snapshotAll();
    await readInspectionSnapshot("insp-1");
    expect(await snapshotAll()).toBe(before);
  });
});
