"use client";

import { useState } from "react";
import { FileJson, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ID } from "@/lib/domain/types";
import {
  ExportError,
  buildInspectionExport,
  estimateExportBytes,
  exportFileName,
  exportProblems,
  isLargeExport,
} from "@/lib/export/inspection-export";
import { formatBytes } from "@/lib/format";
import { describeStorageError } from "@/lib/storage/errors";
import { getPhotoOriginal } from "@/lib/storage/photos";
import { readInspectionSnapshot, type InspectionSnapshot } from "@/lib/storage/snapshot";

type Phase =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "confirm-large"; snapshot: InspectionSnapshot; estimate: number }
  | { status: "exporting"; done: number; total: number }
  | { status: "done"; fileName: string; size: number }
  | { status: "refused"; problems: readonly string[] }
  | { status: "error"; message: string };

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the data.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Complete JSON data export of the inspection, including original photographs. Read-only. */
export function ExportDataPanel({ inspectionId }: { inspectionId: ID }) {
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const busy = phase.status === "checking" || phase.status === "exporting";

  const run = async (snapshot: InspectionSnapshot) => {
    setPhase({ status: "exporting", done: 0, total: snapshot.photos.length });
    try {
      const blob = await buildInspectionExport(snapshot, {
        loadOriginal: getPhotoOriginal,
        exportedAt: new Date().toISOString(),
        onProgress: (done, total) => setPhase({ status: "exporting", done, total }),
      });
      const fileName = exportFileName(snapshot);
      download(blob, fileName);
      setPhase({ status: "done", fileName, size: blob.size });
    } catch (error) {
      setPhase(error instanceof ExportError ? { status: "refused", problems: error.problems } : { status: "error", message: describeStorageError(error) });
    }
  };

  const start = async () => {
    setPhase({ status: "checking" });
    try {
      const snapshot = await readInspectionSnapshot(inspectionId);
      if (!snapshot) {
        setPhase({ status: "error", message: "The inspection no longer exists." });
        return;
      }
      const problems = exportProblems(snapshot);
      if (problems.length > 0) {
        setPhase({ status: "refused", problems });
        return;
      }
      const estimate = estimateExportBytes(snapshot.photos);
      if (isLargeExport(estimate)) {
        setPhase({ status: "confirm-large", snapshot, estimate });
        return;
      }
      await run(snapshot);
    } catch (error) {
      setPhase({ status: "error", message: describeStorageError(error) });
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="export-heading" data-testid="export-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id="export-heading" className="text-sm font-semibold text-slate-900">
            Data export (JSON)
          </h2>
          <p className="text-sm text-slate-600">
            A complete, machine-readable copy of this inspection for archiving: all records with their permanent IDs and
            the original photographs, verified against their SHA-256 hashes. It is a data file, not the report.
          </p>
        </div>
        <Button variant="secondary" className="shrink-0" onClick={() => void start()} disabled={busy} data-testid="export-json">
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <FileJson aria-hidden="true" />}
          Export data (JSON)
        </Button>
      </div>

      <div aria-live="polite" data-testid="export-status" data-export-status={phase.status}>
        {phase.status === "checking" ? (
          <p className="text-sm text-slate-600">Checking the stored data…</p>
        ) : phase.status === "exporting" ? (
          <p className="text-sm text-slate-600">
            Verifying and adding original photographs: {phase.done} of {phase.total}…
          </p>
        ) : phase.status === "done" ? (
          <p className="text-sm text-emerald-800">
            Exported <span className="font-mono break-all">{phase.fileName}</span> ({formatBytes(phase.size)}).
          </p>
        ) : phase.status === "refused" ? (
          <Callout tone="danger" title="Export refused: the inspection cannot be exported completely">
            <ul className="list-disc space-y-0.5 pl-5" data-testid="export-problems">
              {phase.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-2">No file was created and nothing has been changed.</p>
          </Callout>
        ) : phase.status === "error" ? (
          <Callout tone="danger" title="The export could not be created">
            {phase.message} Nothing has been changed.
          </Callout>
        ) : null}
      </div>

      <ConfirmDialog
        open={phase.status === "confirm-large"}
        title="Large export"
        description={
          phase.status === "confirm-large" ? (
            <>
              This export will be about {formatBytes(phase.estimate)} because it contains every original photograph. Creating
              it may take a while and use significant memory on this device.
            </>
          ) : null
        }
        confirmLabel="Export anyway"
        onConfirm={() => {
          if (phase.status === "confirm-large") void run(phase.snapshot);
        }}
        onCancel={() => setPhase({ status: "idle" })}
      />
    </section>
  );
}
