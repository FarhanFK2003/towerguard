import { INSPECTION_STATUS_LABELS, type InspectionStatus } from "@/lib/domain/constants";
import { reviewCounts, reviewState, type ReviewCounts, type ReviewState } from "@/lib/domain/finding";
import { assessReadiness, type Readiness } from "@/lib/domain/readiness";
import type { Annotation, Finding, ID, Inspection, IsoDateTime, PhotoRecord } from "@/lib/domain/types";
import type { InspectionSnapshot } from "@/lib/storage/snapshot";

/**
 * Pure assembly of a printable inspection report from stored records. Every
 * value comes from the snapshot; missing or damaged data is reported as an
 * issue, never dropped or invented.
 */

export const REPORT_DISCLAIMER: readonly string[] = [
  "This report documents visual inspection observations recorded manually by the inspector. TowerGuard does not perform automated image analysis.",
  "Findings, categories and priorities are inspector-entered information. Inspector priority is a follow-up priority, not an engineering severity rating.",
  "Engineering severity is not assessed: every finding records it as “Not assessed”.",
  "This report is not a structural engineering assessment or certification, and it does not establish that the inspected structure is safe.",
  "Structural conclusions require the judgement of a qualified engineer.",
];

export interface LifecycleBanner {
  status: InspectionStatus;
  label: string;
  isFinal: boolean;
  title: string;
  detail: string;
}

export function lifecycleBanner(inspection: Inspection): LifecycleBanner {
  const label = INSPECTION_STATUS_LABELS[inspection.status];
  if (inspection.status === "finalised" && inspection.finalisation) {
    return {
      status: "finalised",
      label,
      isFinal: true,
      title: "Finalised documentation",
      detail: `Documentation completed by ${inspection.finalisation.finalisedBy}. Finalisation is not a structural safety or engineering assessment.`,
    };
  }
  return {
    status: inspection.status,
    label,
    isFinal: false,
    title: inspection.status === "draft" ? "DRAFT — NOT FINAL" : "IN REVIEW — NOT FINAL",
    detail:
      inspection.status === "draft"
        ? "This report documents work in progress. Findings and evidence may still change."
        : "Findings are still being reviewed and may change. This is not the final documentation.",
  };
}

export interface ReportAnnotation {
  annotation: Annotation;
  /** Per-photo number in creation order, as shown in the annotation workspace. */
  number: number;
  /** e.g. "P-02 #3". */
  ref: string;
}

export interface ReportPhoto {
  photo: PhotoRecord;
  /** Report-local reference in upload order, e.g. "P-01". */
  ref: string;
  annotations: ReportAnnotation[];
  imageMissing: boolean;
}

export interface ReportEvidenceAnnotation {
  annotationId: ID;
  resolved?: ReportAnnotation;
  problem?: string;
}

export interface ReportEvidence {
  photoId: ID;
  photo?: ReportPhoto;
  problem?: string;
  annotations: ReportEvidenceAnnotation[];
}

export interface ReportFinding {
  finding: Finding;
  /** Report-local reference in creation order, e.g. "F-01". */
  ref: string;
  /** First 8 characters of the permanent ID. */
  shortId: string;
  reviewState: ReviewState;
  evidence: ReportEvidence[];
}

export interface ReportIssue {
  kind: "damaged_photo" | "damaged_annotation" | "damaged_finding" | "missing_image" | "broken_evidence" | "orphan_annotation";
  message: string;
}

export interface ReportSummary extends ReviewCounts {
  photos: number;
  annotations: number;
  damagedPhotos: number;
  damagedAnnotations: number;
  damagedFindings: number;
  missingImages: number;
}

export interface ReportModel {
  generatedAt: IsoDateTime;
  inspection: Inspection;
  banner: LifecycleBanner;
  summary: ReportSummary;
  readiness: Readiness;
  photos: ReportPhoto[];
  findings: ReportFinding[];
  issues: ReportIssue[];
}

const pad = (n: number) => String(n).padStart(2, "0");

export function buildReportModel(snapshot: InspectionSnapshot, generatedAt: IsoDateTime): ReportModel {
  const missingImages = new Set(snapshot.missingImageIds);
  const issues: ReportIssue[] = [];

  // Photos (upload order) with their annotations numbered per photo (creation order).
  const photos: ReportPhoto[] = snapshot.photos.map((photo, index) => {
    const ref = `P-${pad(index + 1)}`;
    const annotations = snapshot.annotations
      .filter((a) => a.photoId === photo.id)
      .map((annotation, i) => ({ annotation, number: i + 1, ref: `${ref} #${i + 1}` }));
    return { photo, ref, annotations, imageMissing: missingImages.has(photo.id) };
  });
  const photoById = new Map(photos.map((p) => [p.photo.id, p]));
  const annotationById = new Map(photos.flatMap((p) => p.annotations.map((a) => [a.annotation.id, a] as const)));

  for (const annotation of snapshot.annotations) {
    if (!photoById.has(annotation.photoId)) {
      issues.push({
        kind: "orphan_annotation",
        message: `Annotation ${annotation.id.slice(0, 8)} refers to a photograph that is missing or damaged (${annotation.photoId.slice(0, 8)}).`,
      });
    }
  }

  const findings: ReportFinding[] = snapshot.findings.map((finding, index) => {
    const ref = `F-${pad(index + 1)}`;
    const evidence: ReportEvidence[] = finding.evidence.map((link) => {
      const photo = photoById.get(link.photoId);
      const item: ReportEvidence = {
        photoId: link.photoId,
        photo,
        problem: photo ? undefined : "Linked photograph is missing or damaged.",
        annotations: link.annotationIds.map((annotationId) => {
          const resolved = annotationById.get(annotationId);
          if (!resolved) return { annotationId, problem: "Linked annotation is missing or damaged." };
          if (resolved.annotation.photoId !== link.photoId) {
            return { annotationId, resolved, problem: "Linked annotation is not on this photograph." };
          }
          return { annotationId, resolved };
        }),
      };
      if (item.problem) {
        issues.push({ kind: "broken_evidence", message: `${ref}: linked photograph ${link.photoId.slice(0, 8)} is missing or damaged.` });
      }
      for (const a of item.annotations) {
        if (a.problem) issues.push({ kind: "broken_evidence", message: `${ref}: ${a.problem} (${a.annotationId.slice(0, 8)})` });
      }
      return item;
    });
    return { finding, ref, shortId: finding.id.slice(0, 8), reviewState: reviewState(finding), evidence };
  });

  for (const p of photos) {
    if (p.imageMissing) issues.push({ kind: "missing_image", message: `${p.ref} (${p.photo.fileName}): the original image data is missing from storage.` });
  }
  for (const d of snapshot.damagedPhotos) issues.push({ kind: "damaged_photo", message: `Damaged photograph record ${d.key} could not be included.` });
  for (const d of snapshot.damagedAnnotations) issues.push({ kind: "damaged_annotation", message: `Damaged annotation record ${d.key} could not be included.` });
  for (const d of snapshot.damagedFindings) issues.push({ kind: "damaged_finding", message: `Damaged finding record ${d.key} could not be included.` });

  return {
    generatedAt,
    inspection: snapshot.inspection,
    banner: lifecycleBanner(snapshot.inspection),
    summary: {
      ...reviewCounts(snapshot.findings),
      photos: snapshot.photos.length,
      annotations: snapshot.annotations.length,
      damagedPhotos: snapshot.damagedPhotos.length,
      damagedAnnotations: snapshot.damagedAnnotations.length,
      damagedFindings: snapshot.damagedFindings.length,
      missingImages: snapshot.missingImageIds.length,
    },
    readiness: assessReadiness(snapshot.findings, snapshot.damagedFindings.length),
    photos,
    findings,
    issues,
  };
}
