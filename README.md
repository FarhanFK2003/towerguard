# TowerGuard

*Visual Infrastructure Inspection and Evidence Management*

TowerGuard is a browser-based workflow for documenting visual inspections of telecom towers and steel
structures. The inspector uploads site photographs, marks regions on them, records findings linked to
those marked regions, reviews each finding explicitly, and finalises the inspection. TowerGuard then
produces a printable report and a complete, verifiable data export.

## AI status

> TowerGuard currently provides a human-led infrastructure inspection workflow. Photographs,
> annotations, findings and review decisions are entered and verified by the inspector. Automated AI
> inference is not currently implemented.

TowerGuard does not run or call any AI model and does not perform automated image analysis. It has
no automated detections, confidence scores or generated recommendations. Annotation labels, finding
categories and priorities are chosen by the inspector, and every record is marked as manually entered.

## The problem

Visual inspections of towers and steel structures produce many photographs. The observations drawn
from them are often written up separately, for example in spreadsheets or word-processor reports.
The link between an observation and the photograph that supports it is easily lost. It can also be
unclear which observations were actually reviewed, and whether the photographs in a report are the
ones originally taken.

TowerGuard keeps each observation, its photographic evidence and the review decision together, from
upload to report.

## Who it is for

Inspectors and inspection teams who document the visible condition of telecom towers and steel
structures, and who need reports that clearly separate observations from engineering judgement.
TowerGuard is a single-user, local tool: each browser holds its own inspections.

The workflow:

1. **Create an inspection:** site, structure type, inspector, date, location and weather.
2. **Upload photographs.** Originals are stored unchanged and fingerprinted with SHA-256.
3. **Annotate** visible areas of concern with rectangles and points.
4. **Record findings** linked to specific photographs and annotated regions.
5. **Review findings:** confirm them, or dismiss them with a reason.
6. **Finalise** the inspection, which locks it against changes.
7. **Report and export:** print the report or save it as PDF, and export the full inspection as JSON.

## Why evidence-linked documentation helps

- **Traceable findings.** Every finding references its photographs and annotated regions by permanent
  ID. A report shows each finding with its evidence highlighted on the photograph.
- **Unchanged originals.** Photographs are stored byte-for-byte with a SHA-256 hash that can be
  re-verified at any time. The report lists every hash.
- **Explicit review.** Findings start as observations and change status only through an explicit
  review. A finding edited after its review is flagged and must be reviewed again.
- **A real lock.** Finalising is enforced in storage, not only in the interface: a finalised
  inspection's photographs, annotations and findings cannot be changed.
- **Verifiable output.** Each report shows a fingerprint of the data it was generated from. The JSON
  export carries the same fingerprint and verifies every original photograph before writing it.

## Current capabilities

- **Inspection management:** create, view and delete inspections, with a draft → in review →
  finalised lifecycle. A finalised inspection can be reopened for further review.
- **Local photo storage:** JPEG, PNG and WebP up to 20 MB, with the format detected from the file's
  signature bytes. Originals are stored unchanged in the browser with a SHA-256 hash and a separate
  thumbnail; the hash can be re-checked on demand.
- **Image annotations:** rectangles and points drawn on the photograph, with select, move, resize,
  label, zoom and pan. Coordinates are stored relative to the original image, so annotations stay
  aligned at any size.
- **Structured findings:** title, description, category, inspector priority, component location and
  recommended action. Each finding is linked to photographs and annotations, and records who
  entered it and when.
- **Review and finalisation:** confirm, dismiss with a required reason, or return to observation.
  Readiness checks block finalisation until every finding has a current review.
- **Reports:** a read-only report of everything above, with annotated evidence images, a photograph
  register with SHA-256 hashes, any data problems, and a scope-and-limitations statement.
- **PDF printing:** fixed A4 pages with 14 mm margins. The lifecycle status (for example
  "DRAFT — NOT FINAL") and page numbers are printed on every page.
- **JSON export and integrity:** a complete, versioned export of one inspection, including every
  original photograph after verifying it against its SHA-256 hash. See
  [docs/export-format.md](docs/export-format.md).

## Quick start for judges

Requirements: Node.js 22 or later, and Microsoft Edge or Google Chrome.

```bash
npm ci          # install the exact dependency versions from package-lock.json
npm run build   # production build
npm start       # serve the production build
```

Open the URL printed by `npm start`, by default **http://localhost:3000**.

Use `localhost`, not the machine's network IP address. TowerGuard uses browser APIs, such as Web
Crypto for SHA-256 hashing, that are only available in a secure context, and `localhost` counts as
one.

All data is stored in the browser that opens the app. Nothing is uploaded, and there is no account
to create.

## Demo walkthrough (3–5 minutes)

1. **Dashboard:** the workflow, the scope note and the local-only storage indicator.
2. **Create an inspection:** choose **New inspection**, enter the demonstration inspection details
   from [docs/demo-checklist.md](docs/demo-checklist.md), and use **Use today** for the date.
3. **Upload photographs:** drag in the three photos from `docs/demo-photos/` and add their
   attribution captions. Each shows its dimensions, and the photograph page shows its SHA-256 hash.
4. **Annotate:** open a photograph, draw two rectangles and a point (**R**, **P**), label them, and
   zoom to show the annotations stay aligned.
5. **Create an evidence-linked finding:** select an annotation and choose **Create finding from
   annotation**; the evidence is pre-linked. Note that inspector priority is separate from
   engineering severity, which shows as "Not assessed".
6. **Review findings:** on the inspection page choose **Start review**. Confirm one finding, and
   dismiss another with a reason.
7. **Finalise:** the review card shows any remaining blockers. Resolve them, acknowledge any warnings,
   and choose **Finalise inspection**. The inspection becomes read-only.
8. **Open the report:** choose **View report**. Show the "Finalised documentation" banner, the data
   fingerprint, the evidence images with the finding's annotations highlighted, the photograph
   register and the disclaimer.
9. **Print or save as PDF:** choose **Print / Save as PDF**, A4 paper, with the browser's
   **Headers and footers** turned off.
10. **Export JSON:** choose **Export data (JSON)**. The manifest's content fingerprint matches the
    report's.

Preparation steps, including photograph requirements, are in
[docs/demo-checklist.md](docs/demo-checklist.md).

## Demo photographs and credits

Three third-party photographs of telecom towers are included in `docs/demo-photos/` for
demonstration purposes. They are not verified TowerGuard inspection evidence, and any annotations or
findings recorded on them in a demonstration are illustrative.

- They are uploaded manually through the normal inspection workflow. The app does not bundle, serve
  or load them automatically.
- Photographers, sources, licences (CC BY-SA 4.0, Unsplash Licence and Pexels Licence) and SHA-256
  hashes are listed in [docs/demo-photos/CREDITS.md](docs/demo-photos/CREDITS.md). The photographs
  remain under their own licences and are not covered by the TowerGuard code licence.
- [docs/demo-checklist.md](docs/demo-checklist.md) gives the demonstration procedure, including
  the demonstration inspection details and the attribution captions to enter.

## Limitations

- **No AI inference.** All content is entered by the inspector (see [AI status](#ai-status)).
- **No JSON import.** Exports can be kept as a copy but cannot be loaded back into TowerGuard.
- **Local, single-browser storage.** Data lives in the browser's IndexedDB on one device. It is not
  synchronised or shared, and there are no user accounts or multi-user collaboration.
- **Clearing site data deletes everything.** Clearing the browser's site data for TowerGuard removes
  all inspections and photographs.
- **No EXIF extraction.** Capture date, GPS position and other EXIF metadata are not read.
- **Pointer-based annotation.** Drawing, moving and resizing annotations needs a mouse, pen or touch.
  Keyboard shortcuts switch tools and zoom, but shapes cannot be drawn with the keyboard alone.
- **Browser support.** Tested in Microsoft Edge (Chromium) on Windows 11, at viewport widths of
  1366, 1024, 820 and 390 px. Other browsers have not been tested.
- **Print labels need recent Chromium.** The per-page status labels and page numbers use CSS
  page-margin boxes, which require a recent Chromium-based browser. The on-page status banner is
  always printed.
- **Memory use.** Large reports and exports are prepared in browser memory. Photos are processed one
  at a time, but inspections with many large photographs can still use significant memory.
- **Not an engineering assessment.** See [Scope and disclaimer](#scope-and-disclaimer).

## Testing

```bash
npm test           # unit tests (Vitest; IndexedDB tests use fake-indexeddb)
npm run typecheck  # TypeScript, no emit
npm run lint       # ESLint
npm run build      # production build
npm run test:e2e -- http://localhost:3000   # browser checks against a running app
```

The browser checks drive a headless Edge or Chrome over the Chrome DevTools Protocol, with no extra
test dependencies. They use a fresh temporary browser profile and write screenshots, sample PDFs and
a results file to `e2e/output/`, which is git-ignored. Start the app first (`npm run build && npm start`).
To use a specific browser, set `BROWSER_PATH`.

## Scope and disclaimer

- TowerGuard documents visual observations. Findings are entered manually by the inspector.
- Inspector priority is a follow-up priority, not an engineering severity rating. Engineering
  severity is not assessed and is recorded as "Not assessed" for every finding.
- A *confirmed* finding means the inspector reviewed and accepted an observation. Finalising records
  that the documentation is complete.
- Reports are not a structural engineering assessment or certification, and they do not establish
  that a structure is safe. Structural conclusions require the judgement of a qualified engineer.

## How it works

### Stack

Next.js (App Router) · React · TypeScript (strict) · Tailwind CSS · Lucide icons · Vitest. There is
no backend, database server or authentication.

### Local data

Data lives in the browser's IndexedDB database `towerguard`, in the stores `inspections`, `photos`,
`photoBlobs`, `annotations` and `findings`. Related records are written and deleted in single
transactions. Damaged records are reported in the interface and never silently modified or dropped.

### Photographs

- The original file is stored byte-for-byte as a Blob and fingerprinted with SHA-256 (Web Crypto). It
  is never resized, recompressed or rotated. A separate 480 px JPEG thumbnail is used for galleries.
- Re-uploading an identical file to the same inspection is refused.

### Annotations

- Stored in normalised image coordinates: fractions (0–1) of the original image's width and height,
  never screen pixels. Shapes are clamped inside the image.
- Drawn with an SVG overlay and browser pointer events (mouse, pen and touch).
- Keyboard shortcuts: `V` select, `R` rectangle, `P` point, `+`/`-` zoom, `0` reset view, `Esc`
  cancel or deselect.

### Findings and review

- Evidence links reference photographs and annotations by permanent ID, and must belong to the same
  inspection. This is checked in the same transaction as the save.
- Deleting a finding never deletes photographs or annotations. Deleting a photograph or annotation
  removes only the corresponding evidence links; the findings are kept.
- Finalising requires every finding to have a current review and no damaged finding records. Warnings,
  such as a confirmed finding without evidence, must be acknowledged first. A finalised inspection is
  read-only in storage: every photo, annotation and finding write checks the lock in the same
  transaction. Deleting the whole inspection remains possible after an explicit confirmation.

### Reports and data export

- The report (`/inspections/[id]/report`) is generated read-only from the stored data. Opening,
  refreshing, printing or exporting changes nothing.
- Draft and in-review reports are marked **NOT FINAL**. Finalised reports say "Finalised
  documentation" and state that this is not an engineering assessment.
- **Report data fingerprint:** a SHA-256 hash of the canonical report data: the inspection, photo
  metadata including each original's hash, annotations, findings and reviews. The same data always
  gives the same fingerprint. It is shown on the report but never stored, and it is not a digital
  signature.
- **Print / Save as PDF:** photographs are prepared one at a time as print copies with a longest edge
  of at most 1,600 px; the originals are untouched. Printing stays disabled until the copies are
  ready. Before printing, the report checks that the stored data has not changed since it was
  generated, and asks you to refresh if it has.
- **Export data (JSON)** is separate from the report. It is refused rather than produced incomplete
  when records are damaged, image data is missing or evidence links are broken, and it warns before
  very large exports. The format is documented in [docs/export-format.md](docs/export-format.md).

### Project structure

```
src/
  app/                 routes: /, /inspections/new, /inspections/[id] (+ /photos, /findings, /report)
  components/
    layout/            application shell, navigation, page header
    ui/                reusable primitives (Button, Badge, Card, Callout, Field, ConfirmDialog, …)
    dashboard/         dashboard sections
    inspections/       inspection form, list, overview, review card
    photos/            photo gallery, upload, viewer
    annotations/       annotation workspace: toolbar, SVG overlay, list
    findings/          findings list, editor, evidence selector, review panel, summary
    report/            printable report, annotated figures, JSON export panel
  hooks/               React hooks (client-side data loading, report images)
  lib/
    annotations/       geometry and zoom/pan maths
    domain/            typed models, enumerations, validation, readiness rules
    export/            versioned JSON export with verified originals
    photos/            file validation, SHA-256, thumbnails
    report/            report model, canonical JSON, data fingerprint, image preparation
    storage/           IndexedDB wrapper and repositories
tests/                 Vitest unit tests
e2e/                   browser checks and synthetic test images (not inspection photographs)
docs/                  export format and demo checklist
  demo-photos/         third-party demonstration photographs and their credits (not used by the app)
```

## Development note

Parts of this codebase were written with the help of an AI coding assistant (Claude Code), and
commits made that way carry a `Co-Authored-By` trailer. This concerns how the code was written; the
application itself performs no AI inference.
