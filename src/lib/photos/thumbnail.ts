import { PhotoError } from "./errors";

/** Longest edge of gallery thumbnails, in pixels. */
export const THUMBNAIL_MAX_EDGE = 480;
const THUMBNAIL_TYPE = "image/jpeg";
const THUMBNAIL_QUALITY = 0.82;

/** Scales `width`×`height` to fit within `maxEdge`, keeping aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export interface DecodedImage {
  /** Displayed dimensions of the original (EXIF orientation applied). */
  width: number;
  height: number;
  /** Separate, downscaled JPEG for gallery display. The original is untouched. */
  thumbnail: Blob;
}

async function encode(bitmap: ImageBitmap, size: { width: number; height: number }, quality: number): Promise<Blob> {
  const draw = (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => {
    // JPEG has no alpha: paint transparent PNG/WebP areas white rather than black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  };

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("unavailable", "This browser cannot create image thumbnails.");
    draw(ctx);
    return canvas.convertToBlob({ type: THUMBNAIL_TYPE, quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("unavailable", "This browser cannot create image thumbnails.");
  draw(ctx);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoError("unavailable", "Thumbnail encoding failed."))),
      THUMBNAIL_TYPE,
      quality,
    );
  });
}

/**
 * Decodes the image once to measure it and render a thumbnail, then releases
 * the decoded pixels. Also used for report images at a larger size and higher
 * quality. Browser-only (uses `createImageBitmap`).
 */
export async function decodeAndThumbnail(
  image: Blob,
  maxEdge = THUMBNAIL_MAX_EDGE,
  quality = THUMBNAIL_QUALITY,
): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "function") {
    throw new PhotoError("unavailable", "This browser cannot decode images.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch (error) {
    throw new PhotoError(
      "decode_failed",
      "The file could not be read as an image. It may be corrupted or incomplete.",
      { cause: error },
    );
  }
  try {
    const { width, height } = bitmap;
    const thumbnail = await encode(bitmap, fitWithin(width, height, maxEdge), quality);
    return { width, height, thumbnail };
  } finally {
    bitmap.close();
  }
}
