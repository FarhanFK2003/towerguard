"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Printer, RotateCw, SearchX } from "lucide-react";
import { BackLink } from "@/components/layout/BackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useReportImages } from "@/hooks/useReportImages";
import type { ID } from "@/lib/domain/types";
import { computeReportFingerprint } from "@/lib/report/fingerprint";
import type { ReportImageSource } from "@/lib/report/images";
import { buildReportModel } from "@/lib/report/model";
import { describeStorageError } from "@/lib/storage/errors";
import { readInspectionSnapshot } from "@/lib/storage/snapshot";
import { ExportDataPanel } from "./ExportDataPanel";
import { InspectionReport } from "./InspectionReport";

const NO_SOURCES: readonly ReportImageSource[] = [];

type PrintCheck = { status: "idle" | "checking" | "changed" } | { status: "error"; error: unknown };

/** Reads the current stored data and fingerprints it. Read-only. */
async function currentFingerprint(inspectionId: ID): Promise<string | undefined> {
  const snapshot = await readInspectionSnapshot(inspectionId);
  return snapshot ? computeReportFingerprint(snapshot) : undefined;
}

export function ReportView({ inspectionId }: { inspectionId: ID }) {
  const load = useCallback(async () => {
    const snapshot = await readInspectionSnapshot(inspectionId);
    if (!snapshot) return undefined;
    const fingerprint = await computeReportFingerprint(snapshot);
    return { model: buildReportModel(snapshot, new Date().toISOString()), fingerprint };
  }, [inspectionId]);
  const { state, reload } = useAsyncData(load);
  const data = state.status === "ready" ? state.data : undefined;

  const sources = useMemo(
    () => data?.model.photos.map((p) => ({ photoId: p.photo.id, imageMissing: p.imageMissing })) ?? NO_SOURCES,
    [data],
  );
  const images = useReportImages(data?.fingerprint ?? "", sources);
  const [printCheck, setPrintCheck] = useState<PrintCheck>({ status: "idle" });

  const refresh = () => {
    setPrintCheck({ status: "idle" });
    reload();
  };

  const print = async () => {
    if (!data) return;
    setPrintCheck({ status: "checking" });
    try {
      // The report must match the stored data at the moment of printing.
      if ((await currentFingerprint(inspectionId)) !== data.fingerprint) {
        setPrintCheck({ status: "changed" });
        return;
      }
      setPrintCheck({ status: "idle" });
      window.print();
    } catch (error) {
      setPrintCheck({ status: "error", error });
    }
  };

  if (state.status === "loading") {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading report">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Callout tone="danger" title="The report could not be generated">
        <p>{describeStorageError(state.error)}</p>
        <p>Nothing has been changed.</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </Callout>
    );
  }
  if (!data) {
    return (
      <EmptyState
        className="bg-white py-20"
        icon={<SearchX />}
        title="Inspection not found"
        action={
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Back to dashboard
          </Link>
        }
      />
    );
  }

  const { model, fingerprint } = data;
  const printDisabled = !images.ready || printCheck.status === "checking";

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden" data-testid="report-toolbar">
        <BackLink href={`/inspections/${inspectionId}`}>Inspection</BackLink>
        <PageHeader
          eyebrow={`${model.inspection.siteName} (${model.inspection.siteId})`}
          as="h2"
          title="Inspection report"
          description="A read-only, printable report generated from the data stored in this browser. Viewing or printing it changes nothing."
          actions={
            <>
              <Button variant="secondary" onClick={refresh} data-testid="report-refresh">
                <RotateCw aria-hidden="true" />
                Refresh
              </Button>
              <Button onClick={() => void print()} disabled={printDisabled} data-testid="report-print">
                <Printer aria-hidden="true" />
                Print / Save as PDF
              </Button>
            </>
          }
        />

        <p className="text-sm text-slate-600" role="status" aria-live="polite" data-testid="report-image-progress">
          {images.total === 0
            ? "No photographs to prepare."
            : images.ready
              ? `All ${images.total} photographs prepared for printing.`
              : `Preparing photographs for printing: ${images.done} of ${images.total}. Printing is available once all are ready.`}
        </p>

        {printCheck.status === "changed" ? (
          <div data-testid="report-changed">
          <Callout tone="warning" title="The inspection has changed since this report was generated">
            <p>Refresh the report to include the latest data before printing.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={refresh}>
              <RotateCw aria-hidden="true" />
              Refresh report
            </Button>
          </Callout>
          </div>
        ) : printCheck.status === "error" ? (
          <Callout tone="danger" title="The report could not be checked before printing">
            {describeStorageError(printCheck.error)}
          </Callout>
        ) : null}

        <Callout tone="info" title="PDF report or data export">
          <p>
            <strong>Print / Save as PDF</strong> produces this human-readable report. In the print dialog choose “Save
            as PDF” and A4 paper, and turn off the browser&apos;s “Headers and footers” option so the report&apos;s own
            status and page labels are used. <strong>Export data (JSON)</strong> below is a separate, complete data file
            for archiving; it is not a report.
          </p>
        </Callout>

        <ExportDataPanel inspectionId={inspectionId} />
      </div>

      <InspectionReport model={model} fingerprint={fingerprint} images={images.images} />
    </div>
  );
}
