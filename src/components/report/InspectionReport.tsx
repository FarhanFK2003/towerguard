import type { ReactNode } from "react";
import {
  DEFECT_CATEGORY_LABELS,
  ENGINEERING_SEVERITY_LABELS,
  FINDING_STATUS_LABELS,
  INSPECTION_STATUS_LABELS,
  INSPECTOR_PRIORITY_LABELS,
  PHOTO_MIME_TYPE_LABELS,
  STRUCTURE_TYPE_LABELS,
} from "@/lib/domain/constants";
import type { ReviewState } from "@/lib/domain/finding";
import type { ID } from "@/lib/domain/types";
import { formatBytes, formatIsoDate, formatTimestamp } from "@/lib/format";
import { FINGERPRINT_SCHEME } from "@/lib/report/fingerprint";
import type { ReportImage } from "@/lib/report/images";
import { REPORT_DISCLAIMER, type ReportFinding, type ReportModel } from "@/lib/report/model";
import { cn } from "@/lib/cn";
import { ReportFigure } from "./ReportFigure";

const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  unreviewed: "Not yet reviewed",
  incomplete: "Review details incomplete",
  stale: "Edited after review — review out of date",
  current: "Review current",
};

const STATUS_CLASS = { draft: "report-draft", in_review: "report-in-review", finalised: "report-finalised" } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Section({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("space-y-4 border-t border-slate-300 pt-6", className)} data-report-section={id}>
      <h2 id={id} className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fields({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>{children}</dl>;
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-slate-900">{children}</dd>
    </div>
  );
}

const NotRecorded = () => <span className="text-slate-500 italic">Not recorded</span>;

export function InspectionReport({
  model,
  fingerprint,
  images,
}: {
  model: ReportModel;
  fingerprint: string;
  images: ReadonlyMap<ID, ReportImage>;
}) {
  const { inspection, banner, summary } = model;
  const checks = [...model.readiness.blockers, ...model.readiness.warnings];

  return (
    <article
      className={cn(
        "report-document space-y-8 rounded-lg bg-white p-5 text-slate-900 shadow-sm ring-1 ring-slate-200 sm:p-10",
        "print:rounded-none print:p-0 print:shadow-none print:ring-0",
        STATUS_CLASS[inspection.status],
      )}
      data-testid="inspection-report"
      data-status={inspection.status}
      aria-label="Inspection report"
    >
      {/* Cover */}
      <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">TowerGuard · Visual inspection documentation</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Visual inspection report</h1>
            <p className="mt-1 text-base text-slate-700">
              {inspection.siteName} <span className="font-mono text-sm">({inspection.siteId})</span>
            </p>
          </div>
        </div>

        <div
          className={cn(
            "rounded-md border-2 px-4 py-3",
            banner.isFinal ? "border-emerald-700 bg-emerald-50 text-emerald-950" : "border-red-700 bg-red-50 text-red-950",
          )}
          data-testid="report-status-banner"
          data-final={banner.isFinal}
        >
          <p className={cn("font-bold", banner.isFinal ? "text-base" : "text-lg tracking-wide")}>{banner.title}</p>
          <p className="text-sm">{banner.detail}</p>
        </div>

        <Fields>
          <Field label="Site ID">
            <span className="font-mono">{inspection.siteId}</span>
          </Field>
          <Field label="Site name">{inspection.siteName}</Field>
          <Field label="Structure type">{STRUCTURE_TYPE_LABELS[inspection.structureType]}</Field>
          <Field label="Location / address">{inspection.location ?? <NotRecorded />}</Field>
          <Field label="Inspector">{inspection.inspectorName}</Field>
          <Field label="Inspection date">{formatIsoDate(inspection.inspectionDate)}</Field>
          <Field label="Weather">{inspection.weather ?? <NotRecorded />}</Field>
          <Field label="Inspection status">{INSPECTION_STATUS_LABELS[inspection.status]}</Field>
          {inspection.finalisation ? (
            <Field label="Finalised">
              {formatTimestamp(inspection.finalisation.finalisedAt)} by {inspection.finalisation.finalisedBy}
            </Field>
          ) : null}
          <Field label="Record created">{formatTimestamp(inspection.createdAt)}</Field>
          <Field label="Record last updated">{formatTimestamp(inspection.updatedAt)}</Field>
          <Field label="Report generated">
            <span data-testid="report-generated-at">{formatTimestamp(model.generatedAt)}</span>
          </Field>
          <Field label="Inspection ID" wide>
            <span className="font-mono text-xs break-all">{inspection.id}</span>
          </Field>
          <Field label="Notes" wide>
            {inspection.notes ? <span className="whitespace-pre-wrap">{inspection.notes}</span> : <NotRecorded />}
          </Field>
        </Fields>

        <div className="report-avoid-break space-y-1 rounded-md border border-slate-300 bg-slate-50 px-4 py-3" data-testid="report-integrity">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Report data fingerprint (SHA-256)</p>
          <p className="font-mono text-xs break-all text-slate-900" data-testid="report-fingerprint">
            {fingerprint}
          </p>
          <p className="text-xs text-slate-600">
            Calculated over the inspection, photograph metadata (including each original&apos;s SHA-256), annotations,
            findings and reviews shown in this report ({FINGERPRINT_SCHEME}). Regenerating the report from unchanged data
            gives the same fingerprint; any change to that data changes it. It identifies this data state only; it is not
            a digital signature.
          </p>
        </div>
      </header>

      <Section id="report-summary" title="Summary">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="report-summary">
          <Count label="Photographs" value={summary.photos} name="photos" />
          <Count label="Annotations" value={summary.annotations} name="annotations" />
          <Count label="Findings" value={summary.total} name="findings" />
          <Count label="Confirmed (reviewed)" value={summary.confirmed} name="confirmed" />
          <Count label="Not yet reviewed" value={summary.unreviewed} name="unreviewed" />
          <Count label="Review out of date" value={summary.outOfDate} name="out-of-date" />
          <Count label="Dismissed (reviewed)" value={summary.dismissed} name="dismissed" />
          <Count label="Data problems" value={model.issues.length} name="issues" />
        </dl>
        <p className="text-xs text-slate-600">
          “Confirmed” means reviewed and accepted by the inspector; it is not an engineering certification. Inspector
          priority is a follow-up priority, not an engineering severity rating.
        </p>
        {checks.length > 0 ? (
          <div className="report-avoid-break space-y-1 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950" data-testid="report-checks">
            <p className="font-semibold">Documentation checks</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {checks.map((c) => (
                <li key={c.code}>{c.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      {model.issues.length > 0 ? (
        <Section id="report-issues" title="Data problems">
          <div className="space-y-2 rounded-md border-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-950" data-testid="report-issues">
            <p className="font-semibold">
              {plural(model.issues.length, "problem was", "problems were")} found in the stored data. Affected items are
              listed here and marked where they appear; nothing has been changed or deleted.
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {model.issues.map((issue, i) => (
                <li key={i} data-issue-kind={issue.kind}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      <Section id="report-findings" title={`Findings (${model.findings.length})`}>
        {model.findings.length === 0 ? (
          <p className="text-sm text-slate-600">No findings were recorded for this inspection.</p>
        ) : (
          <ol className="space-y-8">
            {model.findings.map((f) => (
              <FindingBlock key={f.finding.id} item={f} images={images} />
            ))}
          </ol>
        )}
      </Section>

      <Section id="report-photos" title={`Photograph register (${model.photos.length})`} className="report-page-break">
        {model.photos.length === 0 ? (
          <p className="text-sm text-slate-600">No photographs were recorded for this inspection.</p>
        ) : (
          <>
            <table className="w-full table-fixed border-collapse text-left text-xs" data-testid="report-photo-table">
              <thead>
                <tr className="border-b border-slate-400">
                  <th scope="col" className="w-14 py-1.5 pr-2 font-semibold">Ref</th>
                  <th scope="col" className="py-1.5 pr-2 font-semibold">Photograph</th>
                  <th scope="col" className="w-[38%] py-1.5 font-semibold">Original SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {model.photos.map((p) => (
                  <tr key={p.photo.id} className="border-b border-slate-200 align-top" data-photo-id={p.photo.id}>
                    <td className="py-1.5 pr-2 font-semibold">{p.ref}</td>
                    <td className="py-1.5 pr-2 break-words">
                      {p.photo.fileName}
                      <span className="block text-slate-600">
                        {PHOTO_MIME_TYPE_LABELS[p.photo.mimeType]} · {p.photo.width}×{p.photo.height} px · {formatBytes(p.photo.sizeBytes)} ·{" "}
                        {plural(p.annotations.length, "annotation", "annotations")}
                      </span>
                      {p.imageMissing ? <span className="block font-semibold text-red-800">Original image missing from storage</span> : null}
                    </td>
                    <td className="py-1.5 font-mono text-[10px] break-all">{p.photo.sha256}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="space-y-8">
              {model.photos.map((p) => (
                <div key={p.photo.id} className="report-avoid-break space-y-3" data-testid="report-photo" data-photo-id={p.photo.id}>
                  <ReportFigure photo={p} image={images.get(p.photo.id)} size="register" caption={p.photo.caption} />
                  <Fields className="text-xs">
                    <Field label="Viewpoint">{p.photo.viewpoint ?? <NotRecorded />}</Field>
                    <Field label="Uploaded">{formatTimestamp(p.photo.uploadedAt)}</Field>
                    <Field label="Photo ID" wide>
                      <span className="font-mono text-xs break-all">{p.photo.id}</span>
                    </Field>
                  </Fields>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      <Section id="report-disclaimer" title="Scope and limitations" className="report-avoid-break">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800" data-testid="report-disclaimer">
          {REPORT_DISCLAIMER.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>
    </article>
  );
}

function Count({ label, value, name }: { label: string; value: number; name: string }) {
  return (
    <div className="rounded-md border border-slate-300 px-3 py-2" data-count={name}>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function FindingBlock({ item, images }: { item: ReportFinding; images: ReadonlyMap<ID, ReportImage> }) {
  const { finding, ref, reviewState } = item;
  return (
    <li className="space-y-4" data-testid="report-finding" data-finding-id={finding.id} data-review-state={reviewState}>
      <div className="report-avoid-break space-y-3">
        <h3 className="text-base font-semibold">
          <span className="mr-2 font-mono text-sm text-slate-600">{ref}</span>
          {finding.title}
        </h3>
        <Fields>
          <Field label="Status">{FINDING_STATUS_LABELS[finding.status]}</Field>
          <Field label="Review">
            <span data-testid="report-review-state">{REVIEW_STATE_LABELS[reviewState]}</span>
          </Field>
          <Field label="Category">{DEFECT_CATEGORY_LABELS[finding.category]}</Field>
          <Field label="Inspector priority">{INSPECTOR_PRIORITY_LABELS[finding.inspectorPriority]}</Field>
          <Field label="Engineering severity">
            <span data-testid="report-engineering-severity">{ENGINEERING_SEVERITY_LABELS[finding.engineeringSeverity]}</span>
            {finding.engineeringReference ? ` (external reference: ${finding.engineeringReference})` : null}
          </Field>
          <Field label="Component / location">{finding.componentLocation ?? <NotRecorded />}</Field>
          <Field label="Description" wide>
            <span className="whitespace-pre-wrap">{finding.description}</span>
          </Field>
          <Field label="Recommended action" wide>
            {finding.recommendedAction ? <span className="whitespace-pre-wrap">{finding.recommendedAction}</span> : <NotRecorded />}
          </Field>
          <Field label="Review decision" wide>
            {finding.review ? (
              <>
                Reviewed by {finding.review.reviewedBy} on {formatTimestamp(finding.review.reviewedAt)}
                {finding.review.note ? <span className="block whitespace-pre-wrap">Note: {finding.review.note}</span> : null}
              </>
            ) : (
              <NotRecorded />
            )}
          </Field>
          <Field label="Recorded">
            Manual entry by {finding.provenance.recordedBy}, {formatTimestamp(finding.provenance.recordedAt)}
          </Field>
          <Field label="Last updated">{formatTimestamp(finding.updatedAt)}</Field>
          <Field label="Finding ID" wide>
            <span className="font-mono text-xs break-all">{finding.id}</span>
          </Field>
        </Fields>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Photographic evidence</p>
        {item.evidence.length === 0 ? (
          <p className="text-sm text-slate-600" data-testid="report-no-evidence">
            No photographic evidence is linked to this finding.
          </p>
        ) : (
          item.evidence.map((e) => {
            const problems = [e.problem ? `${e.problem} (${e.photoId.slice(0, 8)})` : undefined, ...e.annotations.map((a) => (a.problem ? `${a.problem} (${a.annotationId.slice(0, 8)})` : undefined))].filter(
              (p): p is string => Boolean(p),
            );
            return (
              <div key={e.photoId} className="space-y-2" data-testid="report-evidence" data-photo-id={e.photoId}>
                {e.photo ? (
                  <ReportFigure
                    photo={e.photo}
                    image={images.get(e.photoId)}
                    size="evidence"
                    highlight={new Set(e.annotations.filter((a) => a.resolved && !a.problem).map((a) => a.annotationId))}
                  />
                ) : null}
                {e.photo && e.annotations.length === 0 ? (
                  <p className="text-xs text-slate-600">Whole photograph linked; no specific annotation.</p>
                ) : null}
                {problems.length > 0 ? (
                  <ul className="list-disc rounded-md border border-red-700 bg-red-50 py-2 pr-3 pl-7 text-xs text-red-950" data-testid="report-evidence-problem">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </li>
  );
}
