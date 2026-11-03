"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock,
  ListChecks,
  MapPin,
  Paperclip,
  Plus,
  RotateCw,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { ReadOnlyBanner } from "@/components/inspections/ReadOnlyBanner";
import { BackLink } from "@/components/layout/BackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import {
  DEFECT_CATEGORIES,
  DEFECT_CATEGORY_LABELS,
  FINDING_STATUSES,
  FINDING_STATUS_LABELS,
  INSPECTOR_PRIORITIES,
  INSPECTOR_PRIORITY_LABELS,
  isOneOf,
} from "@/lib/domain/constants";
import {
  evidenceCounts,
  filterFindings,
  needsReview,
  nextFindingNeedingReview,
  reviewState,
  type FindingFilters,
} from "@/lib/domain/finding";
import type { ID } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/format";
import { describeStorageError } from "@/lib/storage/errors";
import { listFindings } from "@/lib/storage/findings";
import { getInspection } from "@/lib/storage/inspections";
import { FindingStatusBadge, PriorityBadge, STATUS_EXPLANATIONS } from "./FindingBadges";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 flex-1 basis-40 space-y-1">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function FindingsList({ inspectionId }: { inspectionId: ID }) {
  const load = useCallback(
    () => Promise.all([getInspection(inspectionId), listFindings(inspectionId)]),
    [inspectionId],
  );
  const { state, reload } = useAsyncData(load);
  const [filters, setFilters] = useState<FindingFilters>({});
  const base = `/inspections/${inspectionId}/findings`;

  if (state.status === "loading") {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading findings">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Callout tone="danger" title="Findings could not be loaded">
        <p>{describeStorageError(state.error)}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          <RotateCw aria-hidden="true" />
          Try again
        </Button>
      </Callout>
    );
  }

  const [inspection, { findings, damaged }] = state.data;
  if (!inspection) {
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

  const visible = filterFindings(findings, filters);
  const filtered = Boolean(filters.category || filters.priority || filters.status || filters.needsReview);
  const readOnly = inspection.status === "finalised";
  const needingReview = findings.filter(needsReview).length;
  const next = nextFindingNeedingReview(findings);

  return (
    <div className="space-y-6">
      <BackLink href={`/inspections/${inspectionId}`}>Inspection</BackLink>
      <ReadOnlyBanner inspection={inspection} />
      <PageHeader
        eyebrow={`${inspection.siteName} (${inspection.siteId})`}
        title="Findings"
        description="Inspection observations documented by the inspector, linked to photographic evidence."
        actions={
          <>
            {next ? (
              <Link href={`${base}/${next.id}`} className={buttonClasses({ variant: "secondary" })} data-testid="next-needing-review">
                Next finding needing review
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : null}
            {readOnly ? null : (
              <Link href={`${base}/new`} className={buttonClasses()}>
                <Plus aria-hidden="true" />
                New finding
              </Link>
            )}
          </>
        }
      />

      <Callout tone="info" title="Confirmed means reviewed by the inspector">
        {STATUS_EXPLANATIONS.confirmed} Findings are not automated predictions and carry no engineering severity rating.
      </Callout>

      {damaged.length > 0 ? (
        <Callout tone="warning" title={`${plural(damaged.length, "finding record", "finding records")} could not be displayed`}>
          {damaged.length === 1 ? "It is" : "They are"} stored in this browser but damaged; nothing has been changed or deleted.
          <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </Callout>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4" role="group" aria-label="Filter findings">
          <FilterSelect
            id="filter-category"
            label="Category"
            value={filters.category ?? ""}
            onChange={(v) => setFilters((f) => ({ ...f, category: isOneOf(DEFECT_CATEGORIES, v) ? v : undefined }))}
            options={DEFECT_CATEGORIES.map((c) => ({ value: c, label: DEFECT_CATEGORY_LABELS[c] }))}
          />
          <FilterSelect
            id="filter-priority"
            label="Priority"
            value={filters.priority ?? ""}
            onChange={(v) => setFilters((f) => ({ ...f, priority: isOneOf(INSPECTOR_PRIORITIES, v) ? v : undefined }))}
            options={INSPECTOR_PRIORITIES.map((p) => ({ value: p, label: INSPECTOR_PRIORITY_LABELS[p] }))}
          />
          <FilterSelect
            id="filter-status"
            label="Status"
            value={filters.status ?? ""}
            onChange={(v) => setFilters((f) => ({ ...f, status: isOneOf(FINDING_STATUSES, v) ? v : undefined }))}
            options={FINDING_STATUSES.map((s) => ({ value: s, label: FINDING_STATUS_LABELS[s] }))}
          />
          <Button
            variant={filters.needsReview ? "primary" : "secondary"}
            aria-pressed={Boolean(filters.needsReview)}
            data-testid="filter-needs-review"
            title="Unreviewed observations, reviews that are out of date, and reviews with missing details"
            onClick={() => setFilters((f) => ({ ...f, needsReview: !f.needsReview }))}
          >
            <Clock aria-hidden="true" />
            Needs review ({needingReview})
          </Button>
          {filtered ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <p className="border-b border-slate-200 px-5 py-2 text-sm text-slate-600" data-testid="findings-count" aria-live="polite">
          Showing {visible.length} of {plural(findings.length, "finding", "findings")}
        </p>

        {findings.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ListChecks />}
              title="No findings yet"
              description={
                readOnly
                  ? "No findings were recorded before this inspection was finalised."
                  : "Create a finding here, or select an annotation on a photograph and choose “Create finding from annotation”."
              }
              action={
                readOnly ? undefined : (
                  <Link href={`${base}/new`} className={buttonClasses()}>
                    <Plus aria-hidden="true" />
                    New finding
                  </Link>
                )
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No findings match these filters.</p>
        ) : (
          <ul className="divide-y divide-slate-200" aria-label="Findings">
            {visible.map((finding) => {
              const counts = evidenceCounts(finding.evidence);
              const review = reviewState(finding);
              return (
                <li key={finding.id}>
                  <Link
                    href={`${base}/${finding.id}`}
                    data-finding-id={finding.id}
                    data-review-state={review}
                    className="group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-500"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="text-sm font-semibold text-slate-900">{finding.title}</p>
                      <div className="flex flex-wrap gap-1.5">
                        <PriorityBadge priority={finding.inspectorPriority} />
                        <FindingStatusBadge status={finding.status} />
                        {review === "stale" ? (
                          <Badge tone="warning" icon={<TriangleAlert aria-hidden="true" />}>
                            Edited after review
                          </Badge>
                        ) : review !== "current" ? (
                          <Badge tone="warning" icon={<Clock aria-hidden="true" />}>
                            Needs review
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{DEFECT_CATEGORY_LABELS[finding.category]}</span>
                        {finding.componentLocation ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3.5" aria-hidden="true" />
                            {finding.componentLocation}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1" data-testid="evidence-count">
                          <Paperclip className="size-3.5" aria-hidden="true" />
                          {counts.photos === 0
                            ? "No evidence"
                            : `${plural(counts.photos, "photo", "photos")}, ${plural(counts.annotations, "annotation", "annotations")}`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">Created</span>
                          {formatTimestamp(finding.createdAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-slate-400 group-hover:text-slate-600" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
