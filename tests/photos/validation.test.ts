import { describe, expect, it } from "vitest";
import { PhotoError } from "@/lib/photos/errors";
import { MAX_PHOTO_BYTES, checkPhotoFile, detectImageType, inspectPhotoFile } from "@/lib/photos/validation";
import { SIGNATURES, bytesWithSignature } from "../helpers/fixtures";

function header(signature: readonly number[]) {
  return bytesWithSignature(signature, 12);
}

function rejection(fn: () => unknown): PhotoError {
  try {
    fn();
  } catch (error) {
    if (error instanceof PhotoError) return error;
    throw error;
  }
  throw new Error("expected a PhotoError");
}

describe("detectImageType", () => {
  it("recognises JPEG, PNG and WebP signatures", () => {
    expect(detectImageType(header(SIGNATURES.jpeg))).toBe("image/jpeg");
    expect(detectImageType(header(SIGNATURES.png))).toBe("image/png");
    expect(detectImageType(header(SIGNATURES.webp))).toBe("image/webp");
  });

  it("rejects other formats, RIFF files that are not WebP, and short headers", () => {
    expect(detectImageType(header(SIGNATURES.gif))).toBeNull();
    expect(detectImageType(header([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF/WAVE
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("checkPhotoFile", () => {
  it("returns the detected type, ignoring the extension and reported type", () => {
    expect(checkPhotoFile({ name: "photo.png", size: 100, type: "image/png" }, header(SIGNATURES.jpeg))).toBe(
      "image/jpeg",
    );
  });

  it("accepts a file of exactly the maximum size", () => {
    expect(checkPhotoFile({ name: "a.jpg", size: MAX_PHOTO_BYTES }, header(SIGNATURES.jpeg))).toBe("image/jpeg");
  });

  it("rejects files over 20 MB with the size in the message", () => {
    const error = rejection(() => checkPhotoFile({ name: "big.jpg", size: 25 * 1024 * 1024 }, header(SIGNATURES.jpeg)));
    expect(error.code).toBe("too_large");
    expect(error.message).toBe("big.jpg is 25 MB; the maximum is 20 MB per photograph.");
  });

  it("uses exact byte counts when the file is only just over the limit", () => {
    const error = rejection(() => checkPhotoFile({ name: "big.jpg", size: MAX_PHOTO_BYTES + 1 }, header(SIGNATURES.jpeg)));
    expect(error.message).toBe(
      "big.jpg is 20,971,521 bytes; the maximum is 20,971,520 bytes (20 MB) per photograph.",
    );
  });

  it("rejects empty files", () => {
    expect(rejection(() => checkPhotoFile({ name: "e.jpg", size: 0 }, new Uint8Array())).code).toBe("empty");
  });

  it("rejects unsupported formats and names the supported ones", () => {
    const error = rejection(() =>
      checkPhotoFile({ name: "anim.gif", size: 43, type: "image/gif" }, header(SIGNATURES.gif)),
    );
    expect(error.code).toBe("unsupported_type");
    expect(error.message).toBe("anim.gif is not a supported image (reported as image/gif). Use JPEG, PNG or WebP.");
  });

  it("checks size before format", () => {
    const error = rejection(() => checkPhotoFile({ name: "x.gif", size: MAX_PHOTO_BYTES * 2 }, header(SIGNATURES.gif)));
    expect(error.code).toBe("too_large");
  });
});

describe("inspectPhotoFile", () => {
  it("reads the signature from a real File", async () => {
    const file = new File([bytesWithSignature(SIGNATURES.webp, 200)], "site.webp", { type: "" });
    await expect(inspectPhotoFile(file)).resolves.toBe("image/webp");
  });

  it("rejects a file whose content does not match its extension", async () => {
    const file = new File([new TextEncoder().encode("not an image at all")], "fake.jpg", { type: "image/jpeg" });
    await expect(inspectPhotoFile(file)).rejects.toMatchObject({ code: "unsupported_type" });
  });
});
