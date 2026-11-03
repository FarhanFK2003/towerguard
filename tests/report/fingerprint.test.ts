import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/lib/report/canonical";
import { computeReportFingerprint } from "@/lib/report/fingerprint";
import type { InspectionSnapshot } from "@/lib/storage/snapshot";
import { makeAnnotation, makeFinding, makeInspection, makePhotoRecord } from "../helpers/fixtures";

function snapshot(overrides: Partial<InspectionSnapshot> = {}): InspectionSnapshot {
  return {
    inspection: makeInspection(),
    photos: [makePhotoRecord({ id: "p1", sha256: "1".repeat(64) }), makePhotoRecord({ id: "p2", sha256: "2".repeat(64) })],
    damagedPhotos: [],
    missingImageIds: [],
    annotations: [makeAnnotation({ id: "a1", photoId: "p1" })],
    damagedAnnotations: [],
    findings: [makeFinding({ evidence: [{ photoId: "p1", annotationIds: ["a1"] }] })],
    damagedFindings: [],
    ...overrides,
  };
}

describe("canonicalJson", () => {
  it("sorts keys at every level, keeps array order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: undefined, b: 2 } })).toBe('{"a":{"b":2,"d":[3,1]},"b":1}');
  });

  it("is independent of property insertion order", () => {
    expect(canonicalJson({ x: 1, y: { p: 1, q: 2 } })).toBe(canonicalJson({ y: { q: 2, p: 1 }, x: 1 }));
  });
});

describe("computeReportFingerprint", () => {
  it("is a 64-character hex SHA-256", async () => {
    expect(await computeReportFingerprint(snapshot())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is identical for identical data, regardless of record order and key order", async () => {
    const a = snapshot();
    const reordered = snapshot({ photos: [...a.photos].reverse(), inspection: { ...JSON.parse(JSON.stringify(a.inspection)) } });
    expect(await computeReportFingerprint(reordered)).toBe(await computeReportFingerprint(a));
  });

  it("changes when report-relevant data changes", async () => {
    const base = await computeReportFingerprint(snapshot());
    const variants: InspectionSnapshot[] = [
      snapshot({ inspection: makeInspection({ notes: "Gate locked" }) }),
      snapshot({ inspection: makeInspection({ status: "in_review" }) }),
      snapshot({ photos: [makePhotoRecord({ id: "p1", sha256: "f".repeat(64) }), makePhotoRecord({ id: "p2", sha256: "2".repeat(64) })] }),
      snapshot({ annotations: [makeAnnotation({ id: "a1", photoId: "p1", label: "corrosion" })] }),
      snapshot({ findings: [makeFinding({ status: "confirmed", review: { reviewedBy: "A", reviewedAt: "2026-11-01T00:00:00.000Z", note: "ok" }, updatedAt: "2026-11-01T00:00:00.000Z" })] }),
      snapshot({ findings: [makeFinding({ evidence: [] })] }),
      snapshot({ damagedFindings: [{ key: "broken" }] }),
      snapshot({ missingImageIds: ["p2"] }),
    ];
    const prints = await Promise.all(variants.map(computeReportFingerprint));
    for (const print of prints) expect(print).not.toBe(base);
    expect(new Set(prints).size).toBe(prints.length);
  });
});
