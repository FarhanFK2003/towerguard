"use client";

import { useCallback, type ReactNode } from "react";
import Link from "next/link";
import { ClipboardList, Images, Info, ListChecks, RotateCw, SearchX } from "lucide-react";
import { BackLink } from "@/components/layout/BackLink";
import { PageHeader } from "@/components/layout/PageHeader";
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
  const { state, reload } = useAsyncData(load);

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

  return <InspectionDetails inspection={state.data} />;
}

function InspectionDetails({ inspection }: { inspection: Inspection }) {
  return (
    <div className="space-y-6">
      <BackLink href="/">Dashboard</BackLink>

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
        actions={<DeleteInspectionButton inspection={inspection} />}
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

          <Card>
            <CardHeader
              title="Photographs"
              description="Original photographs and annotated evidence."
              icon={<Images />}
            />
            <CardBody>
              <EmptyState
                icon={<Images />}
                title="No photographs yet"
                description="Photo upload is not available yet."
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Observations & findings"
              description="Recorded and reviewed by the inspector."
              icon={<ListChecks />}
            />
            <CardBody>
              <p className="text-sm text-slate-500">No observations recorded.</p>
            </CardBody>
          </Card>

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
