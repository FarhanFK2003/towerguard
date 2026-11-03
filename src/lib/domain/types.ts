import type {
  AnnotationLabel,
  DefectCategory,
  EngineeringSeverity,
  FindingStatus,
  InspectionStatus,
  InspectorPriority,
  PhotoMimeType,
  ProvenanceSource,
  StructureType,
} from "./constants";

/** Identifier generated with `crypto.randomUUID()`. */
export type ID = string;
/** ISO 8601 timestamp in UTC, e.g. `2026-11-02T10:15:00.000Z`. */
export type IsoDateTime = string;
/** ISO 8601 calendar date, e.g. `2026-11-02`. */
export type IsoDate = string;

/** Who recorded a piece of evidence and how. */
export interface Provenance {
  source: ProvenanceSource;
  recordedBy: string;
  recordedAt: IsoDateTime;
}

export interface Inspection {
  id: ID;
  siteId: string;
  siteName: string;
  structureType: StructureType;
  inspectorName: string;
  inspectionDate: IsoDate;
  location?: string;
  weather?: string;
  notes?: string;
  status: InspectionStatus;
  /**
   * Present exactly when `status` is `finalised`: the inspector completed the
   * documentation. Not a structural safety or engineering assessment.
   */
  finalisation?: InspectionFinalisation;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface InspectionFinalisation {
  finalisedBy: string;
  finalisedAt: IsoDateTime;
}

/** Photo metadata. The image bytes live separately in {@link PhotoBlobRecord}. */
export interface PhotoRecord {
  id: ID;
  inspectionId: ID;
  /** Name of the file as selected by the user. */
  fileName: string;
  /** Detected from the file's signature bytes. */
  mimeType: PhotoMimeType;
  sizeBytes: number;
  /** Pixel dimensions as displayed (EXIF orientation applied by the browser). */
  width: number;
  height: number;
  /** Lower-case hex SHA-256 of the original, unmodified file bytes. */
  sha256: string;
  uploadedAt: IsoDateTime;
  /** Last change to caption or viewpoint; equals `uploadedAt` until edited. */
  updatedAt: IsoDateTime;
  caption?: string;
  /** Where the photo was taken from, e.g. "North face, upper section". */
  viewpoint?: string;
}

export interface PhotoBlobRecord {
  photoId: ID;
  inspectionId: ID;
  /** Original upload, stored byte-for-byte. */
  original: Blob;
  thumbnail: Blob;
}

/**
 * Coordinates are fractions (0–1) of the original image's width and height
 * (as recorded on the PhotoRecord), never screen or CSS pixels. A rectangle
 * always lies fully inside the image: x + width ≤ 1 and y + height ≤ 1.
 */
export interface RectShape {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PointShape {
  kind: "point";
  x: number;
  y: number;
}

export type AnnotationShape = RectShape | PointShape;

export interface Annotation {
  id: ID;
  inspectionId: ID;
  photoId: ID;
  shape: AnnotationShape;
  /** Assigned by the inspector. */
  label?: AnnotationLabel;
  provenance: Provenance;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Links a finding to annotated regions on one photograph. */
export interface EvidenceLink {
  photoId: ID;
  annotationIds: ID[];
}

/** Records the inspector's review decision. Not an engineering sign-off. */
export interface FindingReview {
  reviewedBy: string;
  reviewedAt: IsoDateTime;
  note?: string;
}

export interface Finding {
  id: ID;
  inspectionId: ID;
  title: string;
  description: string;
  category: DefectCategory;
  inspectorPriority: InspectorPriority;
  engineeringSeverity: EngineeringSeverity;
  /** Reference to the external engineering assessment, when one exists. */
  engineeringReference?: string;
  status: FindingStatus;
  componentLocation?: string;
  recommendedAction?: string;
  evidence: EvidenceLink[];
  provenance: Provenance;
  review?: FindingReview;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}
