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
  hooks/               React hooks (client-side data loading)
  lib/
    domain/            typed models, enumerations, validation (framework-independent)
    storage/           IndexedDB wrapper and repositories (framework-independent)
tests/                 Vitest unit tests (IndexedDB tests use fake-indexeddb)
e2e/                   dependency-free browser checks (headless Edge/Chrome via DevTools Protocol)
```

## Local data

Data lives in the browser's IndexedDB database `towerguard` (stores: `inspections`, `photos`,
`photoBlobs`, `annotations`, `findings`). Clearing site data for the app deletes it, and it is not
shared between browsers or devices.
