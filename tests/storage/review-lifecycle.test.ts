import { describe, expect, it } from "vitest";
import { reviewState } from "@/lib/domain/finding";
import type { Finding } from "@/lib/domain/types";
import { isInspection } from "@/lib/domain/validation";
import { createAnnotation, deleteAnnotation, updateAnnotation } from "@/lib/storage/annotations";
import { STORES, requestToPromise, withTransaction, type StoreName } from "@/lib/storage/db";
import { createFinding, deleteFinding, getFinding, reviewFinding, updateFinding } from "@/lib/storage/findings";
import {
  createInspection,
  deleteInspection,
  finaliseInspection,
  getInspection,
  getInspectionReadiness,
  reopenInspection,
  startInspectionReview,
  updateInspection,
} from "@/lib/storage/inspections";
import { addPhoto, deletePhoto, deletePhotosForInspection, updatePhotoDetails } from "@/lib/storage/photos";
import { makeAnnotation, makeFinding, makeInspection, makeNewPhoto, setupFreshIndexedDB } from "../helpers/fixtures";

setupFreshIndexedDB();

const at = (minute: number) => new Date(Date.UTC(2026, 10, 3, 9, minute));
const FIELDS = {
  title: "Corrosion at leg B splice",
  description: "Surface rust.",
  category: "corrosion",
  inspectorPriority: "medium",
  status: "confirmed",
} as const;

/** insp-1 with photos p1 (a1, a2) and p2, and finding f1 linked to p1/a1. */
async function seed(): Promise<void> {
  await createInspection(makeInspection({ id: "insp-1" }));
  await addPhoto(makeNewPhoto({ id: "p1", sha256: "1".repeat(64) }));
  await addPhoto(makeNewPhoto({ id: "p2", sha256: "2".repeat(64) }));
  await createAnnotation(makeAnnotation({ id: "a1", photoId: "p1" }));
  await createAnnotation(makeAnnotation({ id: "a2", photoId: "p1", shape: { kind: "point", x: 0.5, y: 0.5 } }));
  await createFinding(makeFinding({ id: "f1", evidence: [{ photoId: "p1", annotationIds: ["a1"] }] }));
}

/** seed(), then review f1 and finalise the inspection. */
async function seedFinalised(): Promise<void> {
  await seed();
  await startInspectionReview("insp-1", at(1));
  await reviewFinding("f1", { decision: "confirm", note: "" }, "A. Inspector", at(2));
  await finaliseInspection("insp-1", { acknowledgeWarnings: false }, at(3));
}

function putRaw(store: StoreName, record: object): Promise<void> {
  return withTransaction(store, "readwrite", async (tx) => {
    await requestToPromise(tx.objectStore(store).put(record));
  });
}

/** Every record in every store (image blobs reduced to their sizes, which Blob equality can't compare). */
async function snapshot(): Promise<string> {
  const stores = Object.values(STORES);
  const all = await withTransaction(stores, "readonly", (tx) =>
    Promise.all(stores.map((s) => requestToPromise<unknown[]>(tx.objectStore(s).getAll()))),
  );
  return JSON.stringify(all, (_key, value: unknown) => (value instanceof Blob ? `Blob(${value.size})` : value));
}

describe("reviewFinding", () => {
  it("confirms with an optional note; the fresh review is current", async () => {
    await seed();
    const updated = await reviewFinding("f1", { decision: "confirm", note: "  Seen on site  " }, "A. Inspector", at(5));
    expect(updated).toMatchObject({
      status: "confirmed",
      review: { reviewedBy: "A. Inspector", reviewedAt: at(5).toISOString(), note: "Seen on site" },
      updatedAt: at(5).toISOString(),
      engineeringSeverity: "not_assessed",
      provenance: { source: "manual" },
    });
    expect(reviewState(updated)).toBe("current");
    await expect(getFinding("f1")).resolves.toEqual(updated);
  });

  it("refuses a dismissal without a reason and saves nothing", async () => {
    await seed();
    const before = await getFinding("f1");
    await expect(reviewFinding("f1", { decision: "dismiss", note: " " }, "A")).rejects.toMatchObject({
      code: "invalid_record",
      message: "A reason is required to dismiss a finding.",
    });
    await expect(getFinding("f1")).resolves.toEqual(before);
  });

  it("dismisses with a reason, and returning to observation clears the review", async () => {
    await seed();
    const dismissed = await reviewFinding("f1", { decision: "dismiss", note: "Shadow, not corrosion" }, "A", at(5));
    expect(dismissed).toMatchObject({ status: "dismissed", review: { note: "Shadow, not corrosion" } });
    const returned = await reviewFinding("f1", { decision: "return", note: "" }, "A", at(6));
    expect(returned.status).toBe("observation");
    expect(returned.review).toBeUndefined();
  });

  it("leaves every other field untouched", async () => {
    await seed();
    const before = (await getFinding("f1")) as Finding;
    const after = await reviewFinding("f1", { decision: "confirm", note: "" }, "A", at(5));
    expect({ ...after, status: before.status, review: before.review, updatedAt: before.updatedAt }).toEqual(before);
  });

  it("fails clearly for unknown or damaged findings", async () => {
    await seed();
    await expect(reviewFinding("missing", { decision: "confirm", note: "" }, "A")).rejects.toMatchObject({ code: "not_found" });
    await putRaw(STORES.findings, { id: "broken", inspectionId: "insp-1" });
    await expect(reviewFinding("broken", { decision: "confirm", note: "" }, "A")).rejects.toMatchObject({ code: "invalid_record" });
  });

  it("new findings must start as observations", async () => {
    await seed();
    const confirmedAtCreation = makeFinding({ id: "f2", status: "confirmed", review: { reviewedBy: "A", reviewedAt: at(0).toISOString() } });
    await expect(createFinding(confirmedAtCreation)).rejects.toMatchObject({ code: "invalid_record" });
  });
});

describe("reviews going out of date", () => {
  async function reviewedSeed() {
    await seed();
    await reviewFinding("f1", { decision: "confirm", note: "" }, "A", at(5));
  }

  it("editing a reviewed finding makes its review stale", async () => {
    await reviewedSeed();
    const edited = await updateFinding("f1", { fields: { ...FIELDS, title: "Edited" } }, "A", at(6));
    expect(reviewState(edited)).toBe("stale");
  });

  it("deleting a linked photograph updates the evidence and makes the review stale", async () => {
    await reviewedSeed();
    await deletePhoto("p1");
    const finding = (await getFinding("f1")) as Finding;
    expect(finding.evidence).toEqual([]);
    expect(reviewState(finding)).toBe("stale");
  });

  it("deleting a linked annotation updates the evidence and makes the review stale", async () => {
    await reviewedSeed();
    await deleteAnnotation("a1");
    const finding = (await getFinding("f1")) as Finding;
    expect(finding.evidence).toEqual([{ photoId: "p1", annotationIds: [] }]);
    expect(reviewState(finding)).toBe("stale");
  });

  it("deleting an unlinked annotation leaves the review current", async () => {
    await reviewedSeed();
    await deleteAnnotation("a2");
    expect(reviewState((await getFinding("f1")) as Finding)).toBe("current");
  });
});

describe("inspection lifecycle", () => {
  it("draft → in_review → finalised → in_review, with metadata only while finalised", async () => {
    await seed();
    await expect(finaliseInspection("insp-1", { acknowledgeWarnings: true })).rejects.toMatchObject({
      message: "Only an inspection in review can be finalised.",
    });
    expect((await startInspectionReview("insp-1", at(1))).status).toBe("in_review");
    await expect(startInspectionReview("insp-1")).rejects.toMatchObject({ code: "invalid_record" });

    await reviewFinding("f1", { decision: "confirm", note: "" }, "A", at(2));
    const finalised = await finaliseInspection("insp-1", { acknowledgeWarnings: false }, at(3));
    expect(finalised).toMatchObject({
      status: "finalised",
      finalisation: { finalisedBy: makeInspection().inspectorName, finalisedAt: at(3).toISOString() },
    });
    await expect(getInspection("insp-1")).resolves.toEqual(finalised);

    const reopened = await reopenInspection("insp-1", at(4));
    expect(reopened.status).toBe("in_review");
    expect(Object.hasOwn(reopened, "finalisation")).toBe(false);
    expect(reopened.siteName).toBe(finalised.siteName);
    await expect(reopenInspection("insp-1")).rejects.toMatchObject({ code: "invalid_record" });
  });

  it("re-checks readiness in storage: unreviewed findings block finalisation", async () => {
    await seed();
    await startInspectionReview("insp-1");
    await expect(finaliseInspection("insp-1", { acknowledgeWarnings: true })).rejects.toMatchObject({
      message: expect.stringContaining("not been reviewed"),
    });
    expect((await getInspection("insp-1"))?.status).toBe("in_review");
  });

  it("out-of-date reviews block finalisation", async () => {
    await seed();
    await startInspectionReview("insp-1");
    await reviewFinding("f1", { decision: "confirm", note: "" }, "A", at(2));
    await updateFinding("f1", { fields: { ...FIELDS, title: "Edited" } }, "A", at(3));
    await expect(finaliseInspection("insp-1", { acknowledgeWarnings: true })).rejects.toMatchObject({
      message: expect.stringContaining("reviewed again"),
    });
  });

  it("damaged finding records block finalisation (they are not ignored)", async () => {
    await seed();
    await startInspectionReview("insp-1");
    await reviewFinding("f1", { decision: "confirm", note: "" }, "A", at(2));
    await putRaw(STORES.findings, { id: "broken", inspectionId: "insp-1", title: 5 });
    await expect(finaliseInspection("insp-1", { acknowledgeWarnings: true })).rejects.toMatchObject({
      message: expect.stringContaining("damaged"),
    });
  });

  it("warnings must be acknowledged before finalising", async () => {
    await createInspection(makeInspection({ id: "empty" }));
    await startInspectionReview("empty");
    expect((await getInspectionReadiness("empty")).warnings.map((w) => w.code)).toEqual(["no_findings"]);
    await expect(finaliseInspection("empty", { acknowledgeWarnings: false })).rejects.toMatchObject({
      message: expect.stringContaining("Acknowledge"),
    });
    await expect(finaliseInspection("empty", { acknowledgeWarnings: true })).resolves.toMatchObject({ status: "finalised" });
  });

  it("a confirmed finding without evidence is a warning, not a blocker", async () => {
    await seed();
    await startInspectionReview("insp-1");
    await updateFinding("f1", { evidence: [] }, "A", at(1));
    await reviewFinding("f1", { decision: "confirm", note: "" }, "A", at(2));
    await expect(finaliseInspection("insp-1", { acknowledgeWarnings: false })).rejects.toMatchObject({ code: "invalid_record" });
    await expect(finaliseInspection("insp-1", { acknowledgeWarnings: true })).resolves.toMatchObject({ status: "finalised" });
  });

  it("existing records without finalisation metadata stay readable", async () => {
    await putRaw(STORES.inspections, makeInspection({ id: "legacy" }));
    const legacy = await getInspection("legacy");
    expect(legacy && isInspection(legacy)).toBe(true);
    expect(Object.hasOwn(legacy ?? {}, "finalisation")).toBe(false);
  });
});

describe("finalisation lock (storage-enforced)", () => {
  const protectedWrites: [string, () => Promise<unknown>][] = [
    ["addPhoto", () => addPhoto(makeNewPhoto({ id: "p3", sha256: "3".repeat(64) }))],
    ["updatePhotoDetails", () => updatePhotoDetails("p1", { caption: "Changed" })],
    ["deletePhoto", () => deletePhoto("p1")],
    ["deletePhotosForInspection", () => deletePhotosForInspection("insp-1")],
    ["createAnnotation", () => createAnnotation(makeAnnotation({ id: "a3", photoId: "p2" }))],
    ["updateAnnotation", () => updateAnnotation("a1", { label: "corrosion" })],
    ["deleteAnnotation", () => deleteAnnotation("a1")],
    ["createFinding", () => createFinding(makeFinding({ id: "f2" }))],
    ["updateFinding", () => updateFinding("f1", { fields: { ...FIELDS, title: "Changed" } }, "A")],
    ["reviewFinding", () => reviewFinding("f1", { decision: "return", note: "" }, "A")],
    ["deleteFinding", () => deleteFinding("f1")],
    ["updateInspection", () => updateInspection("insp-1", { siteName: "Changed" })],
  ];

  it.each(protectedWrites)("%s is refused and changes nothing", async (_name, write) => {
    await seedFinalised();
    const before = await snapshot();
    await expect(write()).rejects.toMatchObject({ code: "locked" });
    expect(await snapshot()).toBe(before);
  });

  it("covers every multi-record cleanup: deleting a linked photo changes no photo, blob, annotation or finding", async () => {
    await seedFinalised();
    const before = await snapshot();
    await expect(deletePhoto("p1")).rejects.toMatchObject({ code: "locked" });
    await expect(deleteAnnotation("a1")).rejects.toMatchObject({ code: "locked" });
    expect(await snapshot()).toBe(before);
  });

  it("only locks the finalised inspection", async () => {
    await seedFinalised();
    await createInspection(makeInspection({ id: "other" }));
    await expect(addPhoto(makeNewPhoto({ id: "px", inspectionId: "other", sha256: "4".repeat(64) }))).resolves.toBeDefined();
  });

  it("reopening restores editing", async () => {
    await seedFinalised();
    await reopenInspection("insp-1");
    await expect(updatePhotoDetails("p1", { caption: "Now editable" })).resolves.toMatchObject({ caption: "Now editable" });
    await expect(reviewFinding("f1", { decision: "return", note: "" }, "A")).resolves.toMatchObject({ status: "observation" });
  });

  it("the whole finalised inspection can still be deleted", async () => {
    await seedFinalised();
    await expect(deleteInspection("insp-1")).resolves.toMatchObject({ photos: 2, annotations: 2, findings: 1 });
    await expect(getInspection("insp-1")).resolves.toBeUndefined();
  });

  it("a status patch cannot finalise or un-finalise an inspection", async () => {
    await seed();
    await startInspectionReview("insp-1");
    await expect(updateInspection("insp-1", { status: "finalised" })).rejects.toMatchObject({ code: "invalid_record" });
    await reviewFinding("f1", { decision: "confirm", note: "" }, "A");
    await finaliseInspection("insp-1", { acknowledgeWarnings: false });
    await expect(updateInspection("insp-1", { status: "in_review" })).rejects.toMatchObject({ code: "locked" });
  });
});
