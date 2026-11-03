# TowerGuard AI

Evidence-based visual inspection and damage documentation for telecom towers and steel structures.

Inspectors upload tower photographs, annotate visible regions, record observations linked to that
visual evidence, review them, and export inspection reports.

## Scope and limitations

- **Browser-only.** No backend, database server or authentication. Data is stored locally in the
  browser (IndexedDB) and is never uploaded.
- **No automated analysis.** All observations are entered and reviewed by the inspector. The app does
  not run or call any AI model, and no output is presented as model inference.
- **Not an engineering assessment.** A *confirmed finding* means the inspector reviewed and accepted
  an observation. It is not engineering certification or a structural safety judgement.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · Lucide icons · Vitest

## Getting started

Requires Node.js 22+.

```bash
npm install
npm run dev        # development server on http://localhost:3000
npm run build      # production build
npm start          # serve the production build
npm test           # unit tests (Vitest)
npm run test:e2e -- http://localhost:3000   # browser checks (needs a running app + Edge/Chrome)
npm run lint       # ESLint
npm run typecheck  # TypeScript, no emit
```

## Project structure

```
src/
  app/                 routes (App Router): /, /inspections/new, /inspections/[id] (+ /photos, /findings, /report)
  components/
    layout/            application shell, navigation, page header
    ui/                reusable primitives (Button, Badge, Card, Callout, Field, ConfirmDialog, …)
    dashboard/         dashboard-specific sections
    inspections/       inspection form, list, overview
    photos/            photo gallery, upload, viewer
    annotations/       annotation workspace: toolbar, SVG overlay, list
    findings/          findings list, editor, evidence selector, summary
    report/            printable inspection report, annotated figures, JSON export panel
  hooks/               React hooks (client-side data loading)
  lib/
    annotations/       pure geometry and zoom/pan maths (unit-tested)
    domain/            typed models, enumerations, validation (framework-independent)
    export/            versioned JSON export with verified originals (docs/export-format.md)
    photos/            file validation, SHA-256, thumbnails (browser APIs, no React)
    report/            report model, canonical JSON, data fingerprint, image preparation
    storage/           IndexedDB wrapper and repositories (framework-independent)
tests/                 Vitest unit tests (IndexedDB tests use fake-indexeddb)
e2e/                   dependency-free browser checks (headless Edge/Chrome via DevTools Protocol)
```

## Local data

Data lives in the browser's IndexedDB database `towerguard` (stores: `inspections`, `photos`,
`photoBlobs`, `annotations`, `findings`). Clearing site data for the app deletes it, and it is not
shared between browsers or devices.

## Photographs

- JPEG, PNG and WebP, up to 20 MB each. The format is detected from the file's signature bytes.
- The original file is stored byte-for-byte as a Blob and fingerprinted with SHA-256 (Web Crypto).
  It is never resized, recompressed or rotated; a separate 480 px JPEG thumbnail is used for galleries.
- Metadata (`photos`) and image data (`photoBlobs`) are written and deleted in single transactions.
- No capture date, GPS or other EXIF data is read or inferred.

## Annotations

- Rectangles and points drawn by the inspector on a photograph (select, move, resize, label, delete).
- Stored in normalised image coordinates (0–1 of the original image's width and height), never screen
  pixels, so they stay correct at any display size, zoom or pan. Shapes are clamped inside the image.
- Labels (corrosion, coating damage, …) are assigned manually; they are not automated classifications.
  Every annotation records `source: "manual"`, who recorded it, and when.
- SVG overlay and browser pointer events (mouse, pen and touch); no graphics libraries.
- Keyboard: `V` select, `R` rectangle, `P` point, `+`/`-` zoom, `0` reset view, `Esc` cancel/deselect.

## Findings

- A finding is an inspection observation documented by the inspector (title, description, category,
  inspector priority, status, component location, recommended action) with manual provenance. It is
  not an automated prediction and carries no confidence score.
- Status: *observation* (not yet reviewed), *confirmed* (reviewed and accepted by the inspector; **not**
  an engineering certification), *dismissed*. Inspector priority is chosen explicitly and is separate
  from engineering severity, which TowerGuard never sets (always "not assessed").
- Evidence links reference photographs and annotations by permanent ID, and must belong to the same
  inspection (checked in the same transaction as the save).
- Deleting a finding never deletes photographs or annotations. Deleting a photograph removes its link
  (and its annotations' links) from findings; deleting an annotation removes just that link. Findings
  are kept, and damaged finding records are never modified.

## Review and finalisation

- Findings are reviewed with explicit actions, separate from editing: confirm (optional note), dismiss
  (reason required) or return to observation. A finding changed after its review (details or evidence)
  is shown as "Edited after review" and needs reviewing again.
- Inspection lifecycle: draft → in review → finalised, and finalised → in review (reopen). Finalising
  requires every finding to have a current review and no damaged finding records; warnings (no findings,
  confirmed findings without evidence) must be acknowledged. Readiness is re-checked in storage.
- A finalised inspection is read-only **in storage**: every photo, annotation and finding write checks the
  lock in the same transaction and changes nothing if finalised. Deleting the whole inspection remains
  possible with an explicit confirmation.
- Finalising records that the inspector completed the documentation. It is not a structural safety or
  engineering assessment.

## Reports and data export

- **Inspection report** (`/inspections/[id]/report`): a read-only report generated from the stored
  data. It covers inspection details, lifecycle status, summary counts, each finding with its review
  and annotated photographic evidence, a photograph register with SHA-256 hashes, any data problems,
  and the scope-and-limitations disclaimer. Opening, refreshing or printing it changes nothing.
- Draft and in-review reports are marked **NOT FINAL**. Finalised reports say "Finalised documentation"
  and state that this is not an engineering assessment. When printed, the status appears on every page.
- **Report data fingerprint:** a SHA-256 hash of the canonical report data (inspection, photo metadata
  including each original's hash, annotations, findings and reviews). The same data always gives the
  same fingerprint, and any change gives a different one. It is shown on the report but never stored,
  and it is not a digital signature.
- **Print / Save as PDF** uses the browser's print dialog with fixed A4 paper and 14 mm margins. Photos
  are prepared one at a time as print copies (longest edge at most 1,600 px; the originals are
  untouched), and printing stays disabled until they are ready. Before printing, the report checks that
  the stored data has not changed since it was generated; if it has, you are asked to refresh. Turn off
  the browser's "Headers and footers" option so the report's own page labels are used.
- **Export data (JSON)** is separate from the report. It writes a complete, versioned copy of the
  inspection, including the original photographs verified against their SHA-256 hashes. It is refused
  rather than produced incomplete when records are damaged, image data is missing or evidence links are
  broken, and it warns before very large exports. See [docs/export-format.md](docs/export-format.md).
  Importing is not supported yet.
