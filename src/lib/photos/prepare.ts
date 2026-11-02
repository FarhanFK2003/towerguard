import { createPhotoRecord } from "@/lib/domain/photo";
import type { ID, PhotoRecord } from "@/lib/domain/types";
import { sha256Hex } from "./hash";
import { decodeAndThumbnail, type DecodedImage } from "./thumbnail";
import { inspectPhotoFile } from "./validation";

export interface PreparedPhoto {
  record: PhotoRecord;
  /** The uploaded bytes, unchanged. */
  original: Blob;
  thumbnail: Blob;
}

export interface PreparePhotoOptions {
  /** Replaces browser image decoding (for tests). */
  decode?: (image: Blob) => Promise<DecodedImage>;
  id?: ID;
  now?: Date;
}

/**
 * Validates a selected file and produces everything needed to store it:
 * metadata (with SHA-256 of the original bytes), the original as a Blob, and a
 * separate thumbnail. Throws a PhotoError for files that cannot be accepted.
 */
export async function preparePhoto(
  file: File,
  inspectionId: ID,
  options: PreparePhotoOptions = {},
): Promise<PreparedPhoto> {
  const mimeType = await inspectPhotoFile(file);
  // A Blob view of the same bytes, labelled with the verified type: no copy, no re-encoding.
  const original = file.slice(0, file.size, mimeType);
  const decode = options.decode ?? decodeAndThumbnail;
  const [sha256, decoded] = await Promise.all([sha256Hex(original), decode(original)]);

  const record = createPhotoRecord(
    {
      inspectionId,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      width: decoded.width,
      height: decoded.height,
      sha256,
    },
    { id: options.id, now: options.now },
  );
  return { record, original, thumbnail: decoded.thumbnail };
}
