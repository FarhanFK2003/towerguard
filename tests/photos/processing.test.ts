import { describe, expect, it, vi } from "vitest";
import { isPhotoRecord } from "@/lib/domain/photo";
import { sha256Hex } from "@/lib/photos/hash";
import { preparePhoto } from "@/lib/photos/prepare";
import { assertStorageAvailable, estimateRequiredBytes } from "@/lib/photos/storage-check";
import { THUMBNAIL_MAX_EDGE, fitWithin, type DecodedImage } from "@/lib/photos/thumbnail";
import { PhotoError } from "@/lib/photos/errors";
import { SIGNATURES, blobBytes, bytesWithSignature } from "../helpers/fixtures";

describe("sha256Hex", () => {
  it("matches the published test vectors", async () => {
    // FIPS 180-2 / NIST vectors.
    await expect(sha256Hex(new TextEncoder().encode("abc"))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    await expect(sha256Hex(new Uint8Array())).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashes a Blob identically to its bytes", async () => {
    const bytes = bytesWithSignature(SIGNATURES.png, 1000);
    expect(await sha256Hex(new Blob([bytes]))).toBe(await sha256Hex(bytes));
  });
});

describe("fitWithin", () => {
  it("scales the longest edge down to the limit, keeping aspect ratio", () => {
    expect(fitWithin(4000, 3000, 480)).toEqual({ width: 480, height: 360 });
    expect(fitWithin(3000, 4000, 480)).toEqual({ width: 360, height: 480 });
  });

  it("never upscales small images", () => {
    expect(fitWithin(300, 200, 480)).toEqual({ width: 300, height: 200 });
  });

  it("keeps extreme panoramas at least one pixel high", () => {
    expect(fitWithin(100000, 10, THUMBNAIL_MAX_EDGE)).toEqual({ width: 480, height: 1 });
  });
});

describe("storage checks", () => {
  it("reserves headroom over the original sizes", () => {
    const required = estimateRequiredBytes([10_000_000, 5_000_000]);
    expect(required).toBeGreaterThan(15_000_000);
  });

  it("passes when enough space is free", () => {
    expect(() => assertStorageAvailable(1000, { usage: 0, quota: 10_000 })).not.toThrow();
  });

  it("fails with a clear message when space is insufficient", () => {
    expect(() => assertStorageAvailable(5_000_000, { usage: 9_000_000, quota: 10_000_000 })).toThrowError(
      /Not enough browser storage.*no existing photographs were removed/,
    );
  });

  it("does not block when the quota is unknown", () => {
    expect(() => assertStorageAvailable(5_000_000, undefined)).not.toThrow();
    expect(() => assertStorageAvailable(5_000_000, {})).not.toThrow();
  });
});

describe("preparePhoto", () => {
  const fakeDecode = vi.fn(
    async (): Promise<DecodedImage> => ({
      width: 4000,
      height: 3000,
      thumbnail: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    }),
  );
  const now = new Date("2026-11-02T10:00:00.000Z");

  it("creates valid metadata from the file's real bytes", async () => {
    const bytes = bytesWithSignature(SIGNATURES.jpeg, 5000);
    const file = new File([bytes], "North face.JPG", { type: "image/jpeg" });

    const prepared = await preparePhoto(file, "insp-1", { decode: fakeDecode, id: "p1", now });

    expect(prepared.record).toEqual({
      id: "p1",
      inspectionId: "insp-1",
      fileName: "North face.JPG",
      mimeType: "image/jpeg",
      sizeBytes: 5000,
      width: 4000,
      height: 3000,
      sha256: await sha256Hex(bytes),
      uploadedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(isPhotoRecord(prepared.record)).toBe(true);
  });

  it("keeps the original bytes unchanged and separate from the thumbnail", async () => {
    const bytes = bytesWithSignature(SIGNATURES.png, 3000);
    const prepared = await preparePhoto(new File([bytes], "a.png"), "insp-1", { decode: fakeDecode });
    expect(await blobBytes(prepared.original)).toEqual([...bytes]);
    expect(prepared.original.type).toBe("image/png");
    expect(prepared.thumbnail).not.toBe(prepared.original);
  });

  it("labels the original with the detected type, not the reported one", async () => {
    const file = new File([bytesWithSignature(SIGNATURES.webp, 100)], "mislabelled.jpg", { type: "image/jpeg" });
    const prepared = await preparePhoto(file, "insp-1", { decode: fakeDecode });
    expect(prepared.record.mimeType).toBe("image/webp");
    expect(prepared.original.type).toBe("image/webp");
  });

  it("rejects unsupported files before decoding them", async () => {
    fakeDecode.mockClear();
    const file = new File([bytesWithSignature(SIGNATURES.gif, 43)], "a.gif", { type: "image/gif" });
    await expect(preparePhoto(file, "insp-1", { decode: fakeDecode })).rejects.toMatchObject({
      code: "unsupported_type",
    });
    expect(fakeDecode).not.toHaveBeenCalled();
  });

  it("passes decode failures through as PhotoErrors", async () => {
    const failingDecode = async (): Promise<DecodedImage> => {
      throw new PhotoError("decode_failed", "The file could not be read as an image.");
    };
    const file = new File([bytesWithSignature(SIGNATURES.jpeg, 100)], "corrupt.jpg");
    await expect(preparePhoto(file, "insp-1", { decode: failingDecode })).rejects.toMatchObject({
      code: "decode_failed",
    });
  });
});
