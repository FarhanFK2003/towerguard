import { describe, expect, it } from "vitest";
import { REPORT_DISCLAIMER, buildReportModel, lifecycleBanner } from "@/lib/report/model";
import type { InspectionSnapshot } from "@/lib/storage/snapshot";
import { makeAnnotation, makeFinding, makeInspection, makePhotoRecord } from "../helpers/fixtures";

const GENERATED = "2026-11-03T12:00:00.000Z";
const reviewed = { reviewedBy: "A. Inspector", reviewedAt: "2026-11-01T00:00:00.000Z" };

function snapshot(overrides: Partial<InspectionSnapshot> = {}): InspectionSnapshot {
  return {
    inspection: makeInspection(),
    photos: [makePhotoRecord({ id: "p1", sha256: "1".repeat(64) }), makePhotoRecord({ id: "p2", sha256: "2".repeat(64) })],
    damagedPhotos: [],
    missingImageIds: [],
    annotations: [
      makeAnnotation({ id: "a1", photoId: "p1" }),
      makeAnnotation({ id: "a2", photoId: "p1" }),
      makeAnnotation({ id: "a3", photoId: "p2" }),
    ],
    damagedAnnotations: [],
    findings: [
      makeFinding({ id: "f-obs" }),
      makeFinding({ id: "f-conf", status: "confirmed", review: reviewed, updatedAt: reviewed.reviewedAt, evidence: [{ photoId: "p1", annotationIds: ["a2"] }] }),
      makeFinding({ id: "f-dis", status: "dismissed", review: { ...reviewed, note: "Shadow" }, updatedAt: reviewed.reviewedAt }),
      makeFinding({ id: "f-stale", status: "confirmed", review: reviewed, updatedAt: "2026-11-02T00:00:00.000Z" }),
    ],
    damagedFindings: [],
    ...overrides,
  };
}

describe("buildReportModel", () => {
  it("summarises counts from the stored records", () => {
    const model = buildReportModel(snapshot(), GENERATED);
    expect(model.generatedAt).toBe(GENERATED);
    expect(model.summary).toMatchObject({
      photos: 2,
      annotations: 3,
      total: 4,
      unreviewed: 1,
      confirmed: 1,
      dismissed: 1,
      outOfDate: 1,
      damagedPhotos: 0,
      damagedAnnotations: 0,
      damagedFindings: 0,
      missingImages: 0,
    });
    expect(model.readiness.blocked).toBe(true);
  });

  it("numbers photos, annotations per photo and findings in stable order", () => {
    const model = buildReportModel(snapshot(), GENERATED);
    expect(model.photos.map((p) => p.ref)).toEqual(["P-01", "P-02"]);
    expect(model.photos[0]?.annotations.map((a) => a.ref)).toEqual(["P-01 #1", "P-01 #2"]);
    expect(model.photos[1]?.annotations.map((a) => a.ref)).toEqual(["P-02 #1"]);
    expect(model.findings.map((f) => f.ref)).toEqual(["F-01", "F-02", "F-03", "F-04"]);
    expect(model.findings[0]?.shortId).toBe("f-obs".slice(0, 8));
    expect(model.findings.map((f) => f.reviewState)).toEqual(["unreviewed", "current", "current", "stale"]);
  });

  it("resolves evidence to photo and annotation references", () => {
    const model = buildReportModel(snapshot(), GENERATED);
    const evidence = model.findings[1]?.evidence[0];
    expect(evidence?.photo?.ref).toBe("P-01");
    expect(evidence?.annotations[0]?.resolved?.ref).toBe("P-01 #2");
    expect(evidence?.problem).toBeUndefined();
    expect(model.issues).toEqual([]);
  });

  it("flags missing photos, missing or misplaced annotations and missing image data instead of dropping them", () => {
    const model = buildReportModel(
      snapshot({
        missingImageIds: ["p2"],
        findings: [makeFinding({ evidence: [{ photoId: "gone", annotationIds: [] }, { photoId: "p1", annotationIds: ["nope", "a3"] }] })],
      }),
      GENERATED,
    );
    const [missingPhoto, partly] = model.findings[0]?.evidence ?? [];
    expect(missingPhoto?.problem).toMatch(/missing or damaged/);
    expect(partly?.annotations[0]?.problem).toMatch(/missing or damaged/);
    expect(partly?.annotations[1]?.problem).toMatch(/not on this photograph/);
    expect(model.photos[1]?.imageMissing).toBe(true);
    expect(model.issues.map((i) => i.kind).sort()).toEqual(["broken_evidence", "broken_evidence", "broken_evidence", "missing_image"]);
  });

  it("lists damaged records and annotations on missing photographs as issues", () => {
    const model = buildReportModel(
      snapshot({
        damagedPhotos: [{ key: "bp" }],
        damagedAnnotations: [{ key: "ba" }],
        damagedFindings: [{ key: "bf" }],
        annotations: [makeAnnotation({ id: "orphan", photoId: "deleted-photo" })],
        findings: [makeFinding({ evidence: [] })],
      }),
      GENERATED,
    );
    expect(model.issues.map((i) => i.kind).sort()).toEqual(["damaged_annotation", "damaged_finding", "damaged_photo", "orphan_annotation"]);
    expect(model.summary).toMatchObject({ damagedPhotos: 1, damagedAnnotations: 1, damagedFindings: 1 });
    expect(model.readiness.blockers.map((b) => b.code)).toContain("damaged_findings");
  });

  it("never alters engineering severity or provenance", () => {
    const model = buildReportModel(snapshot(), GENERATED);
    for (const f of model.findings) {
      expect(f.finding.engineeringSeverity).toBe("not_assessed");
      expect(f.finding.provenance.source).toBe("manual");
    }
  });
});

describe("lifecycleBanner", () => {
  it("marks draft and in-review reports as not final", () => {
    expect(lifecycleBanner(makeInspection())).toMatchObject({ isFinal: false, title: "DRAFT — NOT FINAL" });
    expect(lifecycleBanner(makeInspection({ status: "in_review" }))).toMatchObject({ isFinal: false, title: "IN REVIEW — NOT FINAL" });
  });

  it("marks finalised inspections without implying an engineering assessment", () => {
    const banner = lifecycleBanner(
      makeInspection({ status: "finalised", finalisation: { finalisedBy: "A. Inspector", finalisedAt: GENERATED } }),
    );
    expect(banner).toMatchObject({ isFinal: true, title: "Finalised documentation" });
    expect(banner.detail).toMatch(/not a structural safety or engineering assessment/);
  });
});

describe("REPORT_DISCLAIMER", () => {
  it("covers all required statements", () => {
    const text = REPORT_DISCLAIMER.join(" ");
    expect(text).toMatch(/recorded manually by the inspector/);
    expect(text).toMatch(/does not perform automated image analysis/);
    expect(text).toMatch(/not an engineering severity rating/);
    expect(text).toMatch(/Engineering severity is not assessed/);
    expect(text).toMatch(/not a structural engineering assessment or certification/);
    expect(text).toMatch(/does not establish that the inspected structure is safe/);
    expect(text).toMatch(/qualified engineer/);
  });

  it("does not describe an engineering assessment workflow the app cannot record", () => {
    expect(REPORT_DISCLAIMER.join(" ")).not.toMatch(/external engineering assessment/);
  });
});
