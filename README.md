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
  app/                 routes (App Router): /, /inspections/new, /inspections/[id]
  components/
    layout/            application shell, navigation, page header
    ui/                reusable primitives (Button, Badge, Card, Callout, Field, ConfirmDialog, …)
    dashboard/         dashboard-specific sections
    inspections/       inspection form, list, overview
    photos/            photo gallery, upload, viewer
    annotations/       annotation workspace: toolbar, SVG overlay, list
  hooks/               React hooks (client-side data loading)
  lib/
    annotations/       pure geometry and zoom/pan maths (unit-tested)
    domain/            typed models, enumerations, validation (framework-independent)
    photos/            file validation, SHA-256, thumbnails (browser APIs, no React)
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
