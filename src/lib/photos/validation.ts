import { PHOTO_MIME_TYPE_LABELS, type PhotoMimeType } from "@/lib/domain/constants";
import { formatBytes } from "@/lib/format";
import { PhotoError } from "./errors";

/** Maximum size of a single photograph: 20 MB. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

/** Bytes needed to recognise every supported signature (WebP needs 12). */
export const SIGNATURE_BYTES = 12;

/** `accept` attribute for file inputs; the signature check is what actually decides. */
export const PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const SUPPORTED_LIST = Object.values(PHOTO_MIME_TYPE_LABELS).join(", ").replace(/, ([^,]*)$/, " or $1");

function matches(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * Identifies the image format from the file's leading bytes. Extensions and the
 * browser-reported type are not trusted.
 */
export function detectImageType(header: Uint8Array): PhotoMimeType | null {
  if (matches(header, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matches(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (matches(header, ascii("RIFF")) && matches(header, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

/**
 * Checks size and format. Throws a {@link PhotoError} with a user-facing
 * message; returns the detected type otherwise.
 */
export function checkPhotoFile(
  file: { name: string; size: number; type?: string },
  header: Uint8Array,
): PhotoMimeType {
  if (file.size === 0) {
    throw new PhotoError("empty", `${file.name} is empty (0 bytes).`);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    let actual = formatBytes(file.size);
    let limit = formatBytes(MAX_PHOTO_BYTES);
    // Just over the limit both round to "20 MB"; show exact bytes so the message isn't contradictory.
    if (actual === limit) {
      const bytes = new Intl.NumberFormat("en-GB");
      actual = `${bytes.format(file.size)} bytes`;
      limit = `${bytes.format(MAX_PHOTO_BYTES)} bytes (${formatBytes(MAX_PHOTO_BYTES)})`;
    }
    throw new PhotoError("too_large", `${file.name} is ${actual}; the maximum is ${limit} per photograph.`);
  }
  const type = detectImageType(header);
  if (!type) {
    const reported = file.type ? ` (reported as ${file.type})` : "";
    throw new PhotoError(
      "unsupported_type",
      `${file.name} is not a supported image${reported}. Use ${SUPPORTED_LIST}.`,
    );
  }
  return type;
}

/** Reads the file's signature bytes and runs {@link checkPhotoFile}. */
export async function inspectPhotoFile(file: File): Promise<PhotoMimeType> {
  const header = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  return checkPhotoFile(file, header);
}
