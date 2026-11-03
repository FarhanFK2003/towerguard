import type { ID, PhotoRecord } from "@/lib/domain/types";
import { sha256Hex } from "@/lib/photos/hash";
import { PRODUCT_NAME } from "@/lib/product";
import { canonicalJson } from "@/lib/report/canonical";
import { FINGERPRINT_SCHEME, computeReportFingerprint } from "@/lib/report/fingerprint";
import { buildReportModel } from "@/lib/report/model";
import type { InspectionSnapshot } from "@/lib/storage/snapshot";

/**
 * Complete, versioned JSON export of one inspection, documented in
 * `docs/export-format.md`. The export either contains every record and every
 * verified original photograph, or it is refused; it is never partial.
 */

export const EXPORT_FORMAT = "towerguard-inspection-export";
export const EXPORT_FORMAT_VERSION = 1;
/** Above this estimated size the user is warned before exporting. */
export const LARGE_EXPORT_BYTES = 50 * 1024 * 1024;

export class ExportError extends Error {
  readonly problems: readonly string[];
  constructor(message: string, problems: readonly string[]) {
    super(message);
    this.name = "ExportError";
    this.problems = problems;
  }
}

/**
 * Reasons the snapshot cannot be exported completely: damaged records, missing
 * image data, broken evidence links and annotations on missing photographs.
 */
export function exportProblems(snapshot: InspectionSnapshot): string[] {
  return buildReportModel(snapshot, snapshot.inspection.updatedAt).issues.map((issue) => issue.message);
}

/** Approximate size of the export: base64 grows data by a third, plus metadata. */
export function estimateExportBytes(photos: readonly PhotoRecord[]): number {
  const originals = photos.reduce((sum, p) => sum + p.sizeBytes, 0);
  return Math.ceil(originals / 3) * 4 + 64 * 1024;
}

export const isLargeExport = (estimatedBytes: number) => estimatedBytes > LARGE_EXPORT_BYTES;

// A multiple of 3, so each chunk encodes without padding and chunks concatenate.
const BASE64_CHUNK = 3 * 8192;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK))));
  }
  return parts.join("");
}

export function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A safe download name such as `towerguard-TWR-001-2026-11-02-1a2b3c4d.json`. */
export function exportFileName(snapshot: InspectionSnapshot): string {
  const site = snapshot.inspection.siteId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 40) || "site";
  return `towerguard-${site}-${snapshot.inspection.inspectionDate}-${snapshot.inspection.id.slice(0, 8)}.json`;
}

export interface ExportOptions {
  loadOriginal: (photoId: ID) => Promise<Blob | undefined>;
  exportedAt: string;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Builds the export file. Originals are read, verified against their stored
 * SHA-256 and size, and encoded one at a time; each encoded photograph is
 * turned into a Blob part immediately so only one original is in memory.
 * Reads only: nothing in storage is changed.
 */
export async function buildInspectionExport(snapshot: InspectionSnapshot, options: ExportOptions): Promise<Blob> {
  const problems = exportProblems(snapshot);
  if (problems.length > 0) {
    throw new ExportError("The inspection cannot be exported completely.", problems);
  }

  const { inspection, photos, annotations, findings } = snapshot;
  const manifest = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: options.exportedAt,
    application: PRODUCT_NAME,
    inspectionId: inspection.id,
    inspectionStatus: inspection.status,
    contentFingerprint: { scheme: FINGERPRINT_SCHEME, sha256: await computeReportFingerprint(snapshot) },
    counts: { photos: photos.length, annotations: annotations.length, findings: findings.length },
    originals: {
      encoding: "base64",
      hashAlgorithm: "SHA-256",
      totalBytes: photos.reduce((sum, p) => sum + p.sizeBytes, 0),
      verifiedAtExport: true,
    },
    notes: [
      "Data export of a visual inspection record. It is not a report, a certification or an engineering assessment.",
      "Original photographs are included byte-for-byte and were verified against their recorded SHA-256 and size when exported.",
      "Findings, annotations and reviews were entered manually by the inspector. Engineering severity is recorded as provided; not_assessed means no engineering assessment was recorded.",
    ],
  };

  const parts: BlobPart[] = [
    `{\n"manifest": ${canonicalJson(manifest)},\n"inspection": ${canonicalJson(inspection)},\n"photos": [`,
  ];

  for (const [index, photo] of photos.entries()) {
    const original = await options.loadOriginal(photo.id);
    if (!original) {
      throw new ExportError("The inspection cannot be exported completely.", [
        `The original image for ${photo.fileName} (${photo.id.slice(0, 8)}) is missing from storage.`,
      ]);
    }
    const bytes = new Uint8Array(await original.arrayBuffer());
    const sha256 = await sha256Hex(bytes);
    if (bytes.byteLength !== photo.sizeBytes || sha256 !== photo.sha256) {
      throw new ExportError("The inspection cannot be exported completely.", [
        `The stored original for ${photo.fileName} (${photo.id.slice(0, 8)}) does not match its recorded SHA-256 or size.`,
      ]);
    }
    const record = {
      ...photo,
      original: { mimeType: photo.mimeType, sizeBytes: bytes.byteLength, sha256, encoding: "base64", data: bytesToBase64(bytes) },
    };
    parts.push(new Blob([`${index === 0 ? "\n" : ",\n"}${canonicalJson(record)}`]));
    options.onProgress?.(index + 1, photos.length);
  }

  const list = (records: readonly object[]) => (records.length === 0 ? "" : `\n${records.map((r) => canonicalJson(r)).join(",\n")}\n`);
  parts.push(`${photos.length === 0 ? "" : "\n"}],\n"annotations": [${list(annotations)}],\n"findings": [${list(findings)}]\n}\n`);
  return new Blob(parts, { type: "application/json" });
}
