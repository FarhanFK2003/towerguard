import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, vi } from "vitest";
import type { Inspection, PhotoRecord } from "@/lib/domain/types";
import { closeDatabase } from "@/lib/storage/db";
import type { NewPhoto } from "@/lib/storage/photos";

/** Real JPEG/PNG/WebP signatures followed by filler bytes. */
export const SIGNATURES = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d],
  webp: [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
  gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00],
} as const;

export function bytesWithSignature(signature: readonly number[], totalLength = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(totalLength);
  bytes.set(signature);
  for (let i = signature.length; i < totalLength; i++) bytes[i] = i % 251;
  return bytes;
}

export function makePhotoRecord(overrides: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: "photo-1",
    inspectionId: "insp-1",
    fileName: "north-face.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 64,
    width: 4000,
    height: 3000,
    sha256: "a".repeat(64),
    uploadedAt: "2026-10-30T09:00:00.000Z",
    updatedAt: "2026-10-30T09:00:00.000Z",
    ...overrides,
  };
}

/** A complete photo (metadata + distinct original and thumbnail blobs). */
export function makeNewPhoto(overrides: Partial<PhotoRecord> = {}): NewPhoto {
  const record = makePhotoRecord(overrides);
  return {
    record,
    original: new Blob([bytesWithSignature(SIGNATURES.jpeg, record.sizeBytes)], { type: record.mimeType }),
    thumbnail: new Blob([bytesWithSignature(SIGNATURES.jpeg, 16)], { type: "image/jpeg" }),
  };
}

export async function blobBytes(blob: Blob | undefined): Promise<number[]> {
  if (!blob) throw new Error("expected a Blob");
  return [...new Uint8Array(await blob.arrayBuffer())];
}

export function makeInspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: "insp-1",
    siteId: "TWR-0042",
    siteName: "Hilltop Relay",
    structureType: "lattice",
    inspectorName: "A. Inspector",
    inspectionDate: "2026-10-30",
    status: "draft",
    createdAt: "2026-10-30T08:00:00.000Z",
    updatedAt: "2026-10-30T08:00:00.000Z",
    ...overrides,
  };
}

/** Gives every test its own empty in-memory IndexedDB. */
export function setupFreshIndexedDB(): void {
  beforeEach(async () => {
    await closeDatabase();
    vi.stubGlobal("indexedDB", new IDBFactory());
  });

  afterEach(async () => {
    await closeDatabase();
    vi.unstubAllGlobals();
  });
}
