import { sha256Hex } from "@/lib/photos/hash";
import type { InspectionSnapshot } from "@/lib/storage/snapshot";
import { canonicalJson } from "./canonical";

/** Identifies the fingerprint scheme; change it if the payload definition changes. */
export const FINGERPRINT_SCHEME = "towerguard-report-fingerprint/1";

const byId = <T extends { id: string }>(items: readonly T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const keysOf = (records: readonly { key: string }[]) => records.map((r) => r.key).sort();

/**
 * Everything a report shows, in a canonical form: the full inspection,
 * photo metadata (including each original's SHA-256), annotations, findings
 * (with reviews and evidence), plus the keys of damaged records and photos
 * missing image data. Excludes the generation time, so identical data gives an
 * identical fingerprint.
 */
export function fingerprintPayload(snapshot: InspectionSnapshot) {
  return {
    scheme: FINGERPRINT_SCHEME,
    inspection: snapshot.inspection,
    photos: byId(snapshot.photos),
    missingImageIds: [...snapshot.missingImageIds].sort(),
    annotations: byId(snapshot.annotations),
    findings: byId(snapshot.findings),
    damaged: {
      photos: keysOf(snapshot.damagedPhotos),
      annotations: keysOf(snapshot.damagedAnnotations),
      findings: keysOf(snapshot.damagedFindings),
    },
  };
}

/** SHA-256 (hex) of the canonical report data. Computed on demand; never stored. */
export async function computeReportFingerprint(snapshot: InspectionSnapshot): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(fingerprintPayload(snapshot))));
}
