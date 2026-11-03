import { describe, expect, it } from "vitest";
import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  ExportError,
  LARGE_EXPORT_BYTES,
  base64ToBytes,
  buildInspectionExport,
  bytesToBase64,
  estimateExportBytes,
  exportFileName,
  isLargeExport,
} from "@/lib/export/inspection-export";
import { sha256Hex } from "@/lib/photos/hash";
import { computeReportFingerprint } from "@/lib/report/fingerprint";
import type { InspectionSnapshot } from "@/lib/storage/snapshot";
import { makeAnnotation, makeFinding, makeInspection, makePhotoRecord } from "../helpers/fixtures";

const EXPORTED_AT = "2026-11-03T12:00:00.000Z";

async function photoWithBytes(id: string, bytes: Uint8Array<ArrayBuffer>, uploadedAt: string) {
  const record = makePhotoRecord({ id, sha256: await sha256Hex(bytes), sizeBytes: bytes.byteLength, uploadedAt, updatedAt: uploadedAt });
  return { record, blob: new Blob([bytes]) };
}

async function fixture() {
  const p1 = await photoWithBytes("p1", Uint8Array.from({ length: 70_000 }, (_, i) => (i * 31) % 256), "2026-10-30T09:00:00.000Z");
  const p2 = await photoWithBytes("p2", Uint8Array.from([0xff, 0xd8, 0xff, 0, 1, 2, 3]), "2026-10-30T10:00:00.000Z");
  const snapshot: InspectionSnapshot = {
    inspection: makeInspection({ status: "finalised", finalisation: { finalisedBy: "A. Inspector", finalisedAt: EXPORTED_AT } }),
    photos: [p1.record, p2.record],
    damagedPhotos: [],
    missingImageIds: [],
    annotations: [makeAnnotation({ id: "a1", photoId: "p1" }), makeAnnotation({ id: "a2", photoId: "p2" })],
    damagedAnnotations: [],
    findings: [
      makeFinding({
        id: "f1",
        status: "confirmed",
        review: { reviewedBy: "A. Inspector", reviewedAt: "2026-11-01T00:00:00.000Z", note: "Checked" },
        updatedAt: "2026-11-01T00:00:00.000Z",
        evidence: [{ photoId: "p1", annotationIds: ["a1"] }, { photoId: "p2", annotationIds: [] }],
      }),
    ],
    damagedFindings: [],
  };
  const blobs = new Map([["p1", p1.blob], ["p2", p2.blob]]);
  const loads: string[] = [];
  const loadOriginal = async (id: string) => {
    loads.push(id);
    return blobs.get(id);
  };
  return { snapshot, blobs, loads, loadOriginal };
}

describe("base64", () => {
  it("round-trips bytes across chunk boundaries", () => {
    for (const length of [0, 1, 2, 3, 24_575, 24_576, 24_577, 100_001]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 7 + 3) % 256);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it("matches the standard encoding", () => {
    expect(bytesToBase64(new TextEncoder().encode("TowerGuard"))).toBe(Buffer.from("TowerGuard").toString("base64"));
  });
});

describe("buildInspectionExport", () => {
  it("writes a manifest and every record with IDs and relationships preserved", async () => {
    const { snapshot, loadOriginal } = await fixture();
    const blob = await buildInspectionExport(snapshot, { loadOriginal, exportedAt: EXPORTED_AT });
    const text = await blob.text();
    const data = JSON.parse(text);

    expect(Object.keys(data)).toEqual(["manifest", "inspection", "photos", "annotations", "findings"]);
    expect(data.manifest).toMatchObject({
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: EXPORTED_AT,
      application: "TowerGuard",
      inspectionId: "insp-1",
      inspectionStatus: "finalised",
      counts: { photos: 2, annotations: 2, findings: 1 },
    });
    expect(data.manifest.contentFingerprint.sha256).toBe(await computeReportFingerprint(snapshot));
    expect(data.inspection).toEqual(snapshot.inspection);
    expect(data.photos.map((p: { id: string }) => p.id)).toEqual(["p1", "p2"]);
    expect(data.annotations).toEqual(snapshot.annotations);
    expect(data.findings).toEqual(snapshot.findings);
    expect(data.findings[0].engineeringSeverity).toBe("not_assessed");
    expect(data.findings[0].provenance.source).toBe("manual");
  });

  it("embeds originals that decode to the exact bytes and SHA-256", async () => {
    const { snapshot, blobs, loadOriginal } = await fixture();
    const data = JSON.parse(await (await buildInspectionExport(snapshot, { loadOriginal, exportedAt: EXPORTED_AT })).text());
    for (const photo of data.photos) {
      const bytes = base64ToBytes(photo.original.data);
      const expected = new Uint8Array(await blobs.get(photo.id)!.arrayBuffer());
      expect(bytes).toEqual(expected);
      expect(await sha256Hex(bytes as Uint8Array<ArrayBuffer>)).toBe(photo.sha256);
      expect(photo.original).toMatchObject({ sha256: photo.sha256, sizeBytes: photo.sizeBytes, encoding: "base64" });
    }
  });

  it("is deterministic and reads originals one at a time, in order", async () => {
    const { snapshot, loadOriginal, loads } = await fixture();
    const progress: number[] = [];
    const a = await (await buildInspectionExport(snapshot, { loadOriginal, exportedAt: EXPORTED_AT, onProgress: (d) => progress.push(d) })).text();
    const reversed = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).reverse()) as T;
    const reordered = { ...snapshot, inspection: reversed(snapshot.inspection), findings: snapshot.findings.map(reversed) };
    const b = await (await buildInspectionExport(reordered, { loadOriginal, exportedAt: EXPORTED_AT })).text();
    expect(b).toBe(a);
    expect(loads).toEqual(["p1", "p2", "p1", "p2"]);
    expect(progress).toEqual([1, 2]);
  });

  it("refuses damaged records, missing image data and broken evidence", async () => {
    const { snapshot, loadOriginal } = await fixture();
    const cases: Partial<InspectionSnapshot>[] = [
      { damagedPhotos: [{ key: "bp" }] },
      { damagedAnnotations: [{ key: "ba" }] },
      { damagedFindings: [{ key: "bf" }] },
      { missingImageIds: ["p2"] },
      { findings: [makeFinding({ evidence: [{ photoId: "gone", annotationIds: [] }] })] },
      { annotations: [makeAnnotation({ id: "orphan", photoId: "gone" })] },
    ];
    for (const overrides of cases) {
      const error = await buildInspectionExport({ ...snapshot, ...overrides }, { loadOriginal, exportedAt: EXPORTED_AT }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ExportError);
      expect((error as ExportError).problems.length).toBeGreaterThan(0);
    }
  });

  it("refuses an original that is missing or does not match its SHA-256", async () => {
    const { snapshot, blobs } = await fixture();
    await expect(
      buildInspectionExport(snapshot, { loadOriginal: async (id) => (id === "p2" ? undefined : blobs.get(id)), exportedAt: EXPORTED_AT }),
    ).rejects.toBeInstanceOf(ExportError);
    const error = await buildInspectionExport(snapshot, {
      loadOriginal: async (id) => (id === "p2" ? new Blob([new Uint8Array(7)]) : blobs.get(id)),
      exportedAt: EXPORTED_AT,
    }).catch((e: unknown) => e);
    expect((error as ExportError).problems[0]).toMatch(/does not match its recorded SHA-256/);
  });

  it("exports an inspection without photographs", async () => {
    const { snapshot, loadOriginal } = await fixture();
    const empty = { ...snapshot, photos: [], annotations: [], findings: [] };
    const data = JSON.parse(await (await buildInspectionExport(empty, { loadOriginal, exportedAt: EXPORTED_AT })).text());
    expect(data).toMatchObject({ photos: [], annotations: [], findings: [], manifest: { counts: { photos: 0 } } });
  });
});

describe("export helpers", () => {
  it("flags large exports from the estimated size", () => {
    expect(isLargeExport(estimateExportBytes([makePhotoRecord({ sizeBytes: 1_000_000 })]))).toBe(false);
    const big = Array.from({ length: 3 }, () => makePhotoRecord({ sizeBytes: 15 * 1024 * 1024 }));
    expect(estimateExportBytes(big)).toBeGreaterThan(LARGE_EXPORT_BYTES);
    expect(isLargeExport(estimateExportBytes(big))).toBe(true);
  });

  it("builds a safe file name", async () => {
    const { snapshot } = await fixture();
    const name = exportFileName({ ...snapshot, inspection: { ...snapshot.inspection, siteId: "../TWR 001/<x>" } });
    expect(name).toMatch(/^towerguard-TWR-001-x-\d{4}-\d{2}-\d{2}-insp-1\.json$/);
  });
});
