# TowerGuard inspection export format

- **Format identifier:** `towerguard-inspection-export`
- **Format version:** `1`
- **Media type:** `application/json` (UTF-8)
- **Produced by:** the "Export data (JSON)" action on an inspection's report page

An export is a complete, machine-readable copy of one inspection: its records with their permanent IDs and all of its original photographs. It is a data file for archiving. It is **not** the inspection report, a certification or an engineering assessment.

TowerGuard does not import this format yet.

## Completeness

An export is either complete or not produced at all. It is refused, with a list of the problems, if any of the following apply:

- a photograph, annotation or finding record for the inspection is damaged;
- a photograph's original image data is missing;
- a finding links to a photograph or annotation that does not exist, or to an annotation that belongs to a different photograph;
- an annotation refers to a photograph that does not exist;
- a stored original does not match its recorded SHA-256 hash or byte size.

Exporting only reads data. It never changes or repairs anything in storage.

## Structure

The top-level object always has exactly these members, in this order:

```text
{
"manifest": { … },
"inspection": { … },
"photos": [ … ],
"annotations": [ … ],
"findings": [ … ]
}
```

Each record is serialised canonically: object keys are sorted alphabetically at every level, and absent optional fields are omitted. Each array element is on its own line. The same data exported with the same `exportedAt` always produces byte-identical output.

### `manifest`

| Field | Description |
| --- | --- |
| `format` | Always `"towerguard-inspection-export"`. |
| `formatVersion` | `1`. Incremented for any incompatible change. |
| `exportedAt` | ISO 8601 UTC timestamp of the export. |
| `application` | Name of the producing application: `"TowerGuard"`. Informational only; exports created before the product was renamed contain `"TowerGuard AI"`. |
| `inspectionId` | Permanent ID of the exported inspection. |
| `inspectionStatus` | `draft`, `in_review` or `finalised` at the time of export. |
| `contentFingerprint` | `{ scheme, sha256 }`. This is the same report data fingerprint shown on the printed report for the same data (scheme `towerguard-report-fingerprint/1`), so an export can be matched to a report. |
| `counts` | `{ photos, annotations, findings }`. |
| `originals` | `{ encoding: "base64", hashAlgorithm: "SHA-256", totalBytes, verifiedAtExport: true }`. |
| `notes` | Plain-language statements about the scope of the data. |

### `inspection`

The inspection record as stored: `id`, `siteId`, `siteName`, `structureType`, `inspectorName`, `inspectionDate`, optional `location`, `weather` and `notes`, `status`, `finalisation` (`{ finalisedBy, finalisedAt }`, present exactly when the status is `finalised`), `createdAt` and `updatedAt`.

### `photos`

Ordered by `uploadedAt`, then `id`. Each element is the stored photograph metadata (`id`, `inspectionId`, `fileName`, `mimeType`, `sizeBytes`, `width`, `height`, `sha256`, `uploadedAt`, `updatedAt`, optional `caption` and `viewpoint`), plus:

```text
"original": {
  "mimeType": "image/jpeg",
  "sizeBytes": 123456,
  "sha256": "<64 lower-case hex characters>",
  "encoding": "base64",
  "data": "<standard base64 of the original file bytes>"
}
```

`data` decodes to the exact bytes that were uploaded. Before writing, TowerGuard checks that their SHA-256 and length equal the recorded `sha256` and `sizeBytes`. Thumbnails and report images are not exported, because they can be regenerated from the originals.

### `annotations`

Ordered by `createdAt`, then `id`. Each element is the stored annotation: `id`, `inspectionId`, `photoId`, `shape`, optional `label`, `provenance` (`{ source: "manual", recordedBy, recordedAt }`), `createdAt` and `updatedAt`.

`shape` is either `{ kind: "rect", x, y, width, height }` or `{ kind: "point", x, y }`. Coordinates are fractions (0 to 1) of the original photograph's `width` and `height`.

### `findings`

Ordered by `createdAt`, then `id`. Each element is the stored finding:

- `id`, `inspectionId`, `title`, `description`, `category`;
- `inspectorPriority`: the inspector's follow-up priority, not a severity rating;
- `engineeringSeverity`: `not_assessed` unless an external engineering assessment was recorded; TowerGuard never derives it;
- optional `engineeringReference`;
- `status`: `observation`, `confirmed` or `dismissed`. `confirmed` means reviewed and accepted by the inspector; it is not an engineering certification;
- optional `componentLocation` and `recommendedAction`;
- `evidence`;
- `provenance`;
- optional `review` (`{ reviewedBy, reviewedAt, note? }`);
- `createdAt` and `updatedAt`.

`evidence` is a list of `{ photoId, annotationIds }`. Every `photoId` refers to an element of `photos`. Every annotation ID refers to an element of `annotations` that has the same `photoId`.

## Verifying an export

1. Parse the file and check that `manifest.format` and `manifest.formatVersion` are values you support.
2. For each photograph, base64-decode `original.data`. Check that its length equals `sizeBytes` and its SHA-256 equals `sha256`.
3. Check that each `photoId` and annotation ID in the findings' `evidence` resolves as described above.
