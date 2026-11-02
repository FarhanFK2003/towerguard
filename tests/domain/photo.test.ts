import { describe, expect, it } from "vitest";
import {
  PHOTO_DETAIL_LIMITS,
  applyPhotoDetails,
  createPhotoRecord,
  isPhotoBlobRecord,
  isPhotoRecord,
  validatePhotoDetails,
} from "@/lib/domain/photo";
import { makePhotoRecord } from "../helpers/fixtures";

describe("createPhotoRecord", () => {
  it("records the facts with matching upload and update timestamps", () => {
    const now = new Date("2026-11-02T10:00:00.000Z");
    const record = createPhotoRecord(
      {
        inspectionId: "insp-1",
        fileName: "a.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        width: 4,
        height: 3,
        sha256: "b".repeat(64),
      },
      { now },
    );
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.uploadedAt).toBe(now.toISOString());
    expect(record.updatedAt).toBe(record.uploadedAt);
    expect(Object.hasOwn(record, "caption")).toBe(false);
    expect(isPhotoRecord(record)).toBe(true);
  });
});

describe("validatePhotoDetails", () => {
  it("trims values and turns blanks into clears", () => {
    expect(validatePhotoDetails({ caption: "  Rust on leg B ", viewpoint: "   " })).toEqual({
      ok: true,
      value: { caption: "Rust on leg B", viewpoint: undefined },
    });
  });

  it("enforces length limits", () => {
    const result = validatePhotoDetails({
      caption: "x".repeat(PHOTO_DETAIL_LIMITS.caption + 1),
      viewpoint: "y".repeat(PHOTO_DETAIL_LIMITS.viewpoint + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["caption", "viewpoint"]);
  });
});

describe("applyPhotoDetails", () => {
  const existing = makePhotoRecord({ caption: "Old", viewpoint: "East face" });
  const now = new Date("2026-11-02T12:00:00.000Z");

  it("updates caption and viewpoint and bumps updatedAt only", () => {
    const updated = applyPhotoDetails(existing, { caption: "New", viewpoint: "North face" }, now);
    expect(updated).toEqual({ ...existing, caption: "New", viewpoint: "North face", updatedAt: now.toISOString() });
  });

  it("clears fields set to undefined and keeps fields not mentioned", () => {
    const updated = applyPhotoDetails(existing, { caption: undefined }, now);
    expect(Object.hasOwn(updated, "caption")).toBe(false);
    expect(updated.viewpoint).toBe("East face");
  });

  it("never changes the hash, size or upload time", () => {
    const updated = applyPhotoDetails(existing, { caption: "x" }, now);
    expect(updated.sha256).toBe(existing.sha256);
    expect(updated.sizeBytes).toBe(existing.sizeBytes);
    expect(updated.uploadedAt).toBe(existing.uploadedAt);
  });
});

describe("photo record guards", () => {
  it("accepts complete records and rejects damaged ones", () => {
    expect(isPhotoRecord(makePhotoRecord())).toBe(true);
    expect(isPhotoRecord({ ...makePhotoRecord(), mimeType: "image/gif" })).toBe(false);
    expect(isPhotoRecord({ ...makePhotoRecord(), sha256: "XYZ" })).toBe(false);
    expect(isPhotoRecord({ ...makePhotoRecord(), width: 0 })).toBe(false);
    expect(isPhotoRecord({ ...makePhotoRecord(), sizeBytes: 1.5 })).toBe(false);
    expect(isPhotoRecord({ ...makePhotoRecord(), caption: 5 })).toBe(false);
    expect(isPhotoRecord(null)).toBe(false);
  });

  it("requires both image blobs in a blob record", () => {
    const blob = new Blob([new Uint8Array([1])]);
    expect(isPhotoBlobRecord({ photoId: "p", inspectionId: "i", original: blob, thumbnail: blob })).toBe(true);
    expect(isPhotoBlobRecord({ photoId: "p", inspectionId: "i", original: blob })).toBe(false);
    expect(isPhotoBlobRecord({ photoId: "p", inspectionId: "i", original: "data:", thumbnail: blob })).toBe(false);
  });
});
