import { describe, expect, it } from "vitest";
import type { Inspection } from "@/lib/domain/types";
import { STORES, requestToPromise, withTransaction, type StoreName } from "@/lib/storage/db";
import { StorageError } from "@/lib/storage/errors";
import {
  createInspection,
  deleteInspection,
  getInspection,
  listInspections,
  updateInspection,
} from "@/lib/storage/inspections";
import { getWorkspaceSummary } from "@/lib/storage/workspace";
import { makeInspection, setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

/** Writes a record directly, bypassing validation (to seed related or damaged data). */
function putRaw(store: StoreName, record: object): Promise<void> {
  return withTransaction(store, "readwrite", async (tx) => {
    await requestToPromise(tx.objectStore(store).put(record));
  });
}

function readAll(store: StoreName): Promise<unknown[]> {
  return withTransaction(store, "readonly", (tx) => requestToPromise<unknown[]>(tx.objectStore(store).getAll()));
}

function countByInspection(store: StoreName, inspectionId: string): Promise<number> {
  return withTransaction(store, "readonly", (tx) =>
    requestToPromise(tx.objectStore(store).index("by_inspectionId").count(inspectionId)),
  );
}

async function seedChildren(inspectionId: string, prefix: string): Promise<void> {
  await putRaw(STORES.photos, { id: `${prefix}-photo`, inspectionId });
  await putRaw(STORES.photoBlobs, { photoId: `${prefix}-photo`, inspectionId });
  await putRaw(STORES.annotations, { id: `${prefix}-ann`, inspectionId, photoId: `${prefix}-photo` });
  await putRaw(STORES.findings, { id: `${prefix}-finding`, inspectionId, status: "observation" });
}

describe("createInspection and getInspection", () => {
  it("saves an inspection and reads it back unchanged", async () => {
    const inspection = makeInspection({ location: "Ridge Road" });
    await expect(createInspection(inspection)).resolves.toEqual(inspection);
    await expect(getInspection(inspection.id)).resolves.toEqual(inspection);
  });

  it("returns undefined for an unknown ID", async () => {
    await expect(getInspection("missing")).resolves.toBeUndefined();
  });

  it("refuses to overwrite an existing inspection with the same ID", async () => {
    const original = makeInspection();
    await createInspection(original);

    const duplicate = makeInspection({ siteName: "Impostor" });
    const error = await createInspection(duplicate).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: "already_exists" });
    await expect(getInspection(original.id)).resolves.toEqual(original);
  });

  it("rejects invalid records without writing them", async () => {
    const invalid = { ...makeInspection(), structureType: "bridge" } as unknown as Inspection;
    await expect(createInspection(invalid)).rejects.toMatchObject({ code: "invalid_record" });
    await expect(getInspection(invalid.id)).resolves.toBeUndefined();
  });

  it("reports damaged stored records instead of returning them", async () => {
    await putRaw(STORES.inspections, { id: "damaged", siteName: 7 });
    await expect(getInspection("damaged")).rejects.toMatchObject({ code: "invalid_record" });
  });
});

describe("listInspections", () => {
  it("returns empty results for a new database", async () => {
    await expect(listInspections()).resolves.toEqual({ inspections: [], damaged: [] });
  });

  it("lists inspections most recently updated first", async () => {
    await createInspection(makeInspection({ id: "a", updatedAt: "2026-10-01T00:00:00.000Z" }));
    await createInspection(makeInspection({ id: "b", updatedAt: "2026-10-03T00:00:00.000Z" }));
    await createInspection(makeInspection({ id: "c", updatedAt: "2026-10-02T00:00:00.000Z" }));
    const { inspections, damaged } = await listInspections();
    expect(inspections.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(damaged).toEqual([]);
  });

  it("reports damaged records with their keys while keeping valid records visible", async () => {
    await createInspection(makeInspection({ id: "good-1", updatedAt: "2026-10-01T00:00:00.000Z" }));
    await createInspection(makeInspection({ id: "good-2", updatedAt: "2026-10-02T00:00:00.000Z" }));
    await putRaw(STORES.inspections, { id: "damaged-missing-fields" });
    await putRaw(STORES.inspections, { ...makeInspection({ id: "damaged-bad-status" }), status: "approved" });
    await putRaw(STORES.inspections, { ...makeInspection({ id: "damaged-bad-type" }), siteName: 42 });

    const { inspections, damaged } = await listInspections();

    expect(inspections.map((i) => i.id)).toEqual(["good-2", "good-1"]);
    expect(damaged).toEqual([
      { key: "damaged-bad-status" },
      { key: "damaged-bad-type" },
      { key: "damaged-missing-fields" },
    ]);
  });

  it("reports non-string keys as text", async () => {
    await putRaw(STORES.inspections, { id: 7 });
    await expect(listInspections()).resolves.toEqual({ inspections: [], damaged: [{ key: "7" }] });
  });

  it("reports every record as damaged when none are valid", async () => {
    await putRaw(STORES.inspections, { id: "x" });
    await putRaw(STORES.inspections, { id: "y", siteName: null });
    const { inspections, damaged } = await listInspections();
    expect(inspections).toEqual([]);
    expect(damaged).toHaveLength(2);
  });

  it("never modifies or deletes damaged records, even when listed repeatedly", async () => {
    const damagedRecord = { id: "damaged", siteName: 42, extra: { nested: [1, 2, 3] } };
    await createInspection(makeInspection({ id: "good" }));
    await putRaw(STORES.inspections, damagedRecord);
    const before = await readAll(STORES.inspections);

    await listInspections();
    await listInspections();

    expect(await readAll(STORES.inspections)).toEqual(before);
    expect(before).toContainEqual(damagedRecord);
  });
});

describe("updateInspection", () => {
  it("persists changes and bumps updatedAt", async () => {
    await createInspection(makeInspection({ weather: "Clear" }));
    const now = new Date("2026-11-02T12:00:00.000Z");

    const updated = await updateInspection(
      "insp-1",
      { siteName: "Renamed", status: "in_review", weather: undefined },
      now,
    );

    expect(updated.siteName).toBe("Renamed");
    expect(updated.status).toBe("in_review");
    expect(updated.updatedAt).toBe(now.toISOString());
    expect(updated.weather).toBeUndefined();
    await expect(getInspection("insp-1")).resolves.toEqual(updated);
  });

  it("fails with not_found for an unknown inspection", async () => {
    await expect(updateInspection("missing", { siteName: "X" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("rejects a patch that would make the record invalid and keeps the original", async () => {
    const original = makeInspection();
    await createInspection(original);
    await expect(updateInspection(original.id, { siteName: "" })).rejects.toMatchObject({
      code: "invalid_record",
    });
    await expect(getInspection(original.id)).resolves.toEqual(original);
  });
});

describe("deleteInspection", () => {
  it("removes the inspection and all of its related records", async () => {
    await createInspection(makeInspection({ id: "target" }));
    await seedChildren("target", "t");

    const counts = await deleteInspection("target");

    expect(counts).toEqual({ photos: 1, photoBlobs: 1, annotations: 1, findings: 1 });
    await expect(getInspection("target")).resolves.toBeUndefined();
    for (const store of [STORES.photos, STORES.photoBlobs, STORES.annotations, STORES.findings]) {
      await expect(countByInspection(store, "target")).resolves.toBe(0);
    }
  });

  it("leaves other inspections and their records untouched", async () => {
    await createInspection(makeInspection({ id: "target" }));
    await createInspection(makeInspection({ id: "keep" }));
    await seedChildren("target", "t");
    await seedChildren("keep", "k");

    await deleteInspection("target");

    expect((await listInspections()).inspections.map((i) => i.id)).toEqual(["keep"]);
    for (const store of [STORES.photos, STORES.photoBlobs, STORES.annotations, STORES.findings]) {
      await expect(countByInspection(store, "keep")).resolves.toBe(1);
    }
  });

  it("fails with not_found and changes nothing for an unknown inspection", async () => {
    await createInspection(makeInspection({ id: "keep" }));
    await expect(deleteInspection("missing")).rejects.toMatchObject({ code: "not_found" });
    expect((await listInspections()).inspections).toHaveLength(1);
  });
});

describe("getWorkspaceSummary", () => {
  it("counts inspections, photos and findings by status", async () => {
    await createInspection(makeInspection({ id: "a" }));
    await createInspection(makeInspection({ id: "b" }));
    await seedChildren("a", "a");
    await putRaw(STORES.findings, { id: "b-confirmed", inspectionId: "b", status: "confirmed" });
    await putRaw(STORES.findings, { id: "b-dismissed", inspectionId: "b", status: "dismissed" });

    await expect(getWorkspaceSummary()).resolves.toEqual({
      inspections: 2,
      photos: 1,
      observations: 1,
      confirmedFindings: 1,
    });
  });
});
