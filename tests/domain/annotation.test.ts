import { describe, expect, it } from "vitest";
import { applyAnnotationPatch, createAnnotationRecord, isAnnotation } from "@/lib/domain/annotation";
import { makeAnnotation } from "../helpers/fixtures";

describe("createAnnotationRecord", () => {
  it("records a manually entered annotation with provenance and timestamps", () => {
    const now = new Date("2026-11-02T10:00:00.000Z");
    const record = createAnnotationRecord(
      { inspectionId: "i", photoId: "p", shape: { kind: "point", x: 0.5, y: 0.5 }, label: "corrosion", recordedBy: "A. Inspector" },
      { now },
    );
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.provenance).toEqual({ source: "manual", recordedBy: "A. Inspector", recordedAt: now.toISOString() });
    expect(record.createdAt).toBe(now.toISOString());
    expect(record.updatedAt).toBe(record.createdAt);
    expect(isAnnotation(record)).toBe(true);
  });

  it("omits the label when none is given", () => {
    const record = createAnnotationRecord({ inspectionId: "i", photoId: "p", shape: { kind: "point", x: 0, y: 0 }, recordedBy: "A" });
    expect(Object.hasOwn(record, "label")).toBe(false);
  });
});

describe("applyAnnotationPatch", () => {
  const existing = makeAnnotation({ label: "corrosion" });
  const now = new Date("2026-11-02T12:00:00.000Z");

  it("changes shape and label but never IDs, provenance or createdAt", () => {
    const updated = applyAnnotationPatch(existing, { shape: { kind: "point", x: 0.1, y: 0.2 }, label: "deformation" }, now);
    expect(updated).toEqual({
      ...existing,
      shape: { kind: "point", x: 0.1, y: 0.2 },
      label: "deformation",
      updatedAt: now.toISOString(),
    });
  });

  it("clears the label when it is explicitly set to undefined", () => {
    expect(Object.hasOwn(applyAnnotationPatch(existing, { label: undefined }, now), "label")).toBe(false);
    expect(applyAnnotationPatch(existing, {}, now).label).toBe("corrosion");
  });
});

describe("isAnnotation", () => {
  it("rejects malformed annotations", () => {
    expect(isAnnotation(makeAnnotation())).toBe(true);
    expect(isAnnotation({ ...makeAnnotation(), shape: { kind: "rect", x: 0.9, y: 0, width: 0.5, height: 0.1 } })).toBe(false);
    expect(isAnnotation({ ...makeAnnotation(), label: "ai_detected_rust" })).toBe(false);
    expect(isAnnotation({ ...makeAnnotation(), provenance: { source: "model", recordedBy: "x", recordedAt: "2026-11-02T00:00:00.000Z" } })).toBe(false);
    expect(isAnnotation({ ...makeAnnotation(), provenance: undefined })).toBe(false);
    expect(isAnnotation({ ...makeAnnotation(), photoId: "" })).toBe(false);
    expect(isAnnotation({ ...makeAnnotation(), updatedAt: "later" })).toBe(false);
  });
});
