"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { ClipboardList, FileText, HardDrive, Info, RotateCw, SearchX } from "lucide-react";
import { StorageStatus } from "@/components/dashboard/StorageStatus";
import { FindingsSummaryCard } from "@/components/findings/FindingsSummaryCard";
import { BackLink } from "@/components/layout/BackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { PhotoGallery } from "@/components/photos/PhotoGallery";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import { STRUCTURE_TYPE_LABELS } from "@/lib/domain/constants";
import type { Inspection } from "@/lib/domain/types";
import { formatIsoDate, formatTimestamp } from "@/lib/format";
import { describeStorageError } from "@/lib/storage/errors";
import { getInspection } from "@/lib/storage/inspections";
import { DeleteInspectionButton } from "./DeleteInspectionButton";
import { InspectionReviewCard } from "./InspectionReviewCard";
import { ReadOnlyBanner } from "./ReadOnlyBanner";
import { InspectionStatusBadge } from "./InspectionStatusBadge";

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function NotRecorded() {
  return <span className="text-slate-400">Not recorded</span>;
}

export function InspectionOverview({ inspectionId }: { inspectionId: string }) {
  const load = useCallback(() => getInspection(inspectionId), [inspectionId]);
  const { state, reload, refresh } = useAsyncData(load);

  if (state.status === "loading") return <InspectionOverviewSkeleton />;

  if (state.status === "error") {
    return (
      <div className="space-y-6">
        <BackLink href="/">Dashboard</BackLink>
        <Callout tone="danger" title="The inspection could not be loaded">
          <p>{describeStorageError(state.error)}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </Callout>
      </div>
    );
  }

  if (!state.data) {
    return (
      <EmptyState
        className="bg-white py-20"
        icon={<SearchX />}
        title="Inspection not found"
        description="It may have been deleted, or it was created in a different browser. Inspections are stored only in the browser where they were created."
        action={
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Back to dashboard
          </Link>
        }
      />
    );
  }

  return <InspectionDetails inspection={state.data} onInspectionChanged={refresh} />;
}

function InspectionDetails({ inspection, onInspectionChanged }: { inspection: Inspection; onInspectionChanged: () => void }) {
  const [storageVersion, setStorageVersion] = useState(0);
  const onStorageChanged = useCallback(() => setStorageVersion((v) => v + 1), []);
  const readOnly = inspection.status === "finalised";

  return (
    <div className="space-y-6">
      <BackLink href="/">Dashboard</BackLink>
      <ReadOnlyBanner inspection={inspection} showReopenLink={false} />

      <PageHeader
        eyebrow={`Site ${inspection.siteId}`}
        title={inspection.siteName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <InspectionStatusBadge status={inspection.status} />
            <span>
              Inspected {formatIsoDate(inspection.inspectionDate)} by {inspection.inspectorName}
            </span>
          </span>
        }
        actions={
          <>
            <Link href={`/inspections/${inspection.id}/report`} className={buttonClasses({ variant: "secondary" })} data-testid="view-report">
              <FileText aria-hidden="true" />
              View report
            </Link>
            <DeleteInspectionButton inspection={inspection} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Inspection details" icon={<ClipboardList />} />
            <CardBody>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <Detail label="Site ID">
                  <span className="font-mono">{inspection.siteId}</span>
                </Detail>
                <Detail label="Site name">{inspection.siteName}</Detail>
                <Detail label="Structure type">
                  {STRUCTURE_TYPE_LABELS[inspection.structureType]}
                </Detail>
                <Detail label="Location / address">{inspection.location ?? <NotRecorded />}</Detail>
                <Detail label="Inspector">{inspection.inspectorName}</Detail>
                <Detail label="Inspection date">{formatIsoDate(inspection.inspectionDate)}</Detail>
                <Detail label="Weather">{inspection.weather ?? <NotRecorded />}</Detail>
                <Detail label="Status">
                  <InspectionStatusBadge status={inspection.status} />
                </Detail>
                <div className="sm:col-span-2">
                  <Detail label="Notes">
                    {inspection.notes ? (
                      <span className="whitespace-pre-wrap">{inspection.notes}</span>
                    ) : (
                      <NotRecorded />
                    )}
                  </Detail>
                </div>
              </dl>
            </CardBody>
          </Card>

          <PhotoGallery inspectionId={inspection.id} readOnly={readOnly} onStorageChanged={onStorageChanged} />
        </div>

        <div className="space-y-6">
          <InspectionReviewCard key={inspection.updatedAt} inspection={inspection} onChanged={onInspectionChanged} />

          <FindingsSummaryCard inspectionId={inspection.id} readOnly={readOnly} />

          <Card>
            <CardHeader title="Record" icon={<Info />} />
            <CardBody>
              <dl className="space-y-4">
                <Detail label="Created">{formatTimestamp(inspection.createdAt)}</Detail>
                <Detail label="Last updated">{formatTimestamp(inspection.updatedAt)}</Detail>
                <Detail label="Inspection ID">
                  <span className="break-all font-mono text-xs text-slate-600">{inspection.id}</span>
                </Detail>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Local storage"
              description="Shared by all inspections in this browser."
              icon={<HardDrive />}
            />
            <CardBody>
              <StorageStatus refreshKey={storageVersion} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function InspectionOverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading inspection">
      <Skeleton className="h-4 w-24" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
