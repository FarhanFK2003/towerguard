import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/domain/types";
import { createAnnotation, deleteAnnotation } from "@/lib/storage/annotations";
import { STORES, closeDatabase, requestToPromise, withTransaction } from "@/lib/storage/db";
import { StorageError } from "@/lib/storage/errors";
import { createFinding, deleteFinding, getFinding, listFindings, updateFinding } from "@/lib/storage/findings";
import { createInspection, deleteInspection } from "@/lib/storage/inspections";
import { addPhoto, deletePhoto, deletePhotosForInspection, getPhoto } from "@/lib/storage/photos";
import { makeAnnotation, makeFinding, makeInspection, makeNewPhoto, setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

const FIELDS = {
  title: "Corrosion at leg B splice",
  description: "Surface rust.",
  category: "corrosion",
  inspectorPriority: "medium",
  status: "observation",
} as const;

/** Two inspections; insp-1 has photos p1 (annotations a1, a2) and p2 (a3); insp-2 has p9 (a9). */
async function seed(): Promise<void> {
  await createInspection(makeInspection({ id: "insp-1" }));
  await createInspection(makeInspection({ id: "insp-2" }));
  await addPhoto(makeNewPhoto({ id: "p1", inspectionId: "insp-1", sha256: "1".repeat(64) }));
  await addPhoto(makeNewPhoto({ id: "p2", inspectionId: "insp-1", sha256: "2".repeat(64) }));
  await addPhoto(makeNewPhoto({ id: "p9", inspectionId: "insp-2", sha256: "9".repeat(64) }));
  await createAnnotation(makeAnnotation({ id: "a1", photoId: "p1" }));
  await createAnnotation(makeAnnotation({ id: "a2", photoId: "p1", shape: { kind: "point", x: 0.5, y: 0.5 } }));
  await createAnnotation(makeAnnotation({ id: "a3", photoId: "p2" }));
  await createAnnotation(makeAnnotation({ id: "a9", inspectionId: "insp-2", photoId: "p9" }));
}

function putRaw(record: object): Promise<void> {
  return withTransaction(STORES.findings, "readwrite", async (tx) => {
    await requestToPromise(tx.objectStore(STORES.findings).put(record));
  });
}

function count(store: (typeof STORES)[keyof typeof STORES]): Promise<number> {
  return withTransaction(store, "readonly", (tx) => requestToPromise(tx.objectStore(store).count()));
}

describe("createFinding and retrieval", () => {
  it("stores a finding with evidence across multiple photographs and annotations", async () => {
    await seed();
    const finding = makeFinding({
      evidence: [
        { photoId: "p1", annotationIds: ["a1", "a2"] },
        { photoId: "p2", annotationIds: ["a3"] },
      ],
    });
    await createFinding(finding);
    await expect(getFinding("finding-1")).resolves.toEqual(finding);
  });

  it("allows a finding without evidence", async () => {
    await seed();
    await expect(createFinding(makeFinding({ evidence: [] }))).resolves.toBeDefined();
  });

  it("allows a whole photograph as evidence without any annotation", async () => {
    await seed();
    await expect(createFinding(makeFinding({ evidence: [{ photoId: "p2", annotationIds: [] }] }))).resolves.toBeDefined();
  });

  it("returns undefined for unknown findings", async () => {
    await expect(getFinding("missing")).resolves.toBeUndefined();
  });

  it("persists after the database connection is closed and reopened", async () => {
    await seed();
    await createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a1"] }] }));
    await closeDatabase();
    expect((await listFindings("insp-1")).findings.map((f) => f.id)).toEqual(["finding-1"]);
  });
});

describe("evidence and ownership validation", () => {
  it("rejects a finding for a missing inspection", async () => {
    await seed();
    await expect(createFinding(makeFinding({ inspectionId: "gone" }))).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects photographs from another inspection", async () => {
    await seed();
    const error = await createFinding(makeFinding({ evidence: [{ photoId: "p9", annotationIds: [] }] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toMatchObject({ code: "invalid_record", message: expect.stringContaining("different inspection") });
    expect(await count(STORES.findings)).toBe(0);
  });

  it("rejects annotations from another inspection, even listed under a valid photo", async () => {
    await seed();
    await expect(createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a9"] }] }))).rejects.toMatchObject({
      code: "invalid_record",
    });
  });

  it("rejects an annotation listed under the wrong photograph", async () => {
    await seed();
    await expect(createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a3"] }] }))).rejects.toMatchObject({
      message: expect.stringContaining("not on the photograph"),
    });
  });

  it("rejects missing photo and annotation references", async () => {
    await seed();
    await expect(createFinding(makeFinding({ evidence: [{ photoId: "nope", annotationIds: [] }] }))).rejects.toMatchObject({ code: "invalid_record" });
    await expect(createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["nope"] }] }))).rejects.toMatchObject({ code: "invalid_record" });
  });

  it("rejects duplicate evidence references", async () => {
    await seed();
    const duplicate = makeFinding({
      evidence: [
        { photoId: "p1", annotationIds: ["a1"] },
        { photoId: "p1", annotationIds: ["a2"] },
      ],
    });
    await expect(createFinding(duplicate)).rejects.toMatchObject({ code: "invalid_record" });
  });

  it("never overwrites an existing finding", async () => {
    await seed();
    const first = makeFinding();
    await createFinding(first);
    await expect(createFinding(makeFinding({ title: "Other" }))).rejects.toMatchObject({ code: "already_exists" });
    await expect(getFinding("finding-1")).resolves.toEqual(first);
  });

  it("rejects an update that adds cross-inspection evidence and keeps the stored finding", async () => {
    await seed();
    const original = makeFinding();
    await createFinding(original);
    await expect(updateFinding("finding-1", { evidence: [{ photoId: "p9", annotationIds: [] }] }, "A")).rejects.toMatchObject({
      code: "invalid_record",
    });
    await expect(getFinding("finding-1")).resolves.toEqual(original);
  });
});

describe("listFindings", () => {
  it("lists only the inspection's findings, newest first, and reports damaged records unchanged", async () => {
    await seed();
    await createFinding(makeFinding({ id: "old", createdAt: "2026-10-30T10:00:00.000Z" }));
    await createFinding(makeFinding({ id: "new", createdAt: "2026-10-31T10:00:00.000Z" }));
    await createFinding(makeFinding({ id: "other", inspectionId: "insp-2" }));
    const damaged = { id: "broken", inspectionId: "insp-1", title: 5 };
    await putRaw(damaged);

    const result = await listFindings("insp-1");

    expect(result.findings.map((f) => f.id)).toEqual(["new", "old"]);
    expect(result.damaged).toEqual([{ key: "broken" }]);
    await expect(withTransaction(STORES.findings, "readonly", (tx) => requestToPromise(tx.objectStore(STORES.findings).get("broken")))).resolves.toEqual(damaged);
  });
});

describe("updateFinding", () => {
  it("updates fields, evidence, priority and status and records the reviewer", async () => {
    await seed();
    await createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a1"] }] }));
    const now = new Date("2026-11-03T08:00:00.000Z");
    const updated = await updateFinding(
      "finding-1",
      {
        fields: { ...FIELDS, title: "Edited", inspectorPriority: "urgent", status: "confirmed" },
        evidence: [
          { photoId: "p1", annotationIds: ["a1", "a2"] },
          { photoId: "p2", annotationIds: [] },
        ],
      },
      "B. Reviewer",
      now,
    );
    expect(updated).toMatchObject({
      title: "Edited",
      inspectorPriority: "urgent",
      status: "confirmed",
      engineeringSeverity: "not_assessed",
      review: { reviewedBy: "B. Reviewer", reviewedAt: now.toISOString() },
      updatedAt: now.toISOString(),
    });
    await expect(getFinding("finding-1")).resolves.toEqual(updated);
  });

  it("removing evidence keeps the photograph and annotation", async () => {
    await seed();
    await createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a1"] }] }));
    await updateFinding("finding-1", { evidence: [] }, "A");
    expect((await getFinding("finding-1"))?.evidence).toEqual([]);
    await expect(getPhoto("p1")).resolves.toBeDefined();
    expect(await count(STORES.annotations)).toBe(4);
  });

  it("fails with not_found for unknown findings", async () => {
    await expect(updateFinding("missing", { evidence: [] }, "A")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("deleteFinding", () => {
  it("deletes only the finding, never its photographs or annotations", async () => {
    await seed();
    await createFinding(makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a1", "a2"] }] }));
    await deleteFinding("finding-1");
    await expect(getFinding("finding-1")).resolves.toBeUndefined();
    expect(await count(STORES.photos)).toBe(3);
    expect(await count(STORES.photoBlobs)).toBe(3);
    expect(await count(STORES.annotations)).toBe(4);
  });

  it("fails with not_found for unknown findings", async () => {
    await expect(deleteFinding("missing")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("evidence clean-up when photographs or annotations are deleted", () => {
  const evidence = [
    { photoId: "p1", annotationIds: ["a1", "a2"] },
    { photoId: "p2", annotationIds: ["a3"] },
  ];

  it("deleting an annotation unlinks it but keeps the finding and the photograph link", async () => {
    await seed();
    await createFinding(makeFinding({ evidence }));
    await deleteAnnotation("a2");
    const finding = (await getFinding("finding-1")) as Finding;
    expect(finding.evidence).toEqual([
      { photoId: "p1", annotationIds: ["a1"] },
      { photoId: "p2", annotationIds: ["a3"] },
    ]);
    expect(finding.updatedAt > makeFinding().updatedAt).toBe(true);
  });

  it("deleting a photograph removes its link and its annotations' links from every finding", async () => {
    await seed();
    await createFinding(makeFinding({ id: "f1", evidence }));
    await createFinding(makeFinding({ id: "f2", evidence: [{ photoId: "p1", annotationIds: [] }] }));
    await deletePhoto("p1");
    expect((await getFinding("f1"))?.evidence).toEqual([{ photoId: "p2", annotationIds: ["a3"] }]);
    expect((await getFinding("f2"))?.evidence).toEqual([]);
  });

  it("findings of other inspections are untouched", async () => {
    await seed();
    await createFinding(makeFinding({ id: "f9", inspectionId: "insp-2", evidence: [{ photoId: "p9", annotationIds: ["a9"] }] }));
    const before = await getFinding("f9");
    await deletePhoto("p1");
    await expect(getFinding("f9")).resolves.toEqual(before);
  });

  it("deletePhotosForInspection clears all photo links but keeps the findings", async () => {
    await seed();
    await createFinding(makeFinding({ evidence }));
    await deletePhotosForInspection("insp-1");
    expect((await getFinding("finding-1"))?.evidence).toEqual([]);
  });

  it("damaged finding records are never modified by the clean-up", async () => {
    await seed();
    const damaged = { id: "broken", inspectionId: "insp-1", evidence: [{ photoId: "p1", annotationIds: ["a1"] }] };
    await putRaw(damaged);
    await deletePhoto("p1");
    await expect(withTransaction(STORES.findings, "readonly", (tx) => requestToPromise(tx.objectStore(STORES.findings).get("broken")))).resolves.toEqual(damaged);
  });

  it("deleting the inspection deletes its findings with everything else", async () => {
    await seed();
    await createFinding(makeFinding({ evidence }));
    await createFinding(makeFinding({ id: "f9", inspectionId: "insp-2" }));
    await expect(deleteInspection("insp-1")).resolves.toMatchObject({ findings: 1 });
    expect(await count(STORES.findings)).toBe(1);
  });
});
