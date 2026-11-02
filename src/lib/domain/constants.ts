/**
 * Enumerations for the inspection domain. Each union type is derived from its
 * `as const` array so runtime validation and compile-time types cannot drift.
 */

export const STRUCTURE_TYPES = ["monopole", "lattice", "guyed", "rooftop", "other"] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];

export const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  monopole: "Monopole",
  lattice: "Self-supporting lattice",
  guyed: "Guyed mast",
  rooftop: "Rooftop site",
  other: "Other",
};

export const INSPECTION_STATUSES = ["draft", "in_review", "finalised"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  finalised: "Finalised",
};

export const DEFECT_CATEGORIES = [
  "corrosion",
  "coating_damage",
  "missing_fastener",
  "loose_fastener",
  "deformed_member",
  "weld_anomaly",
  "cable_issue",
  "antenna_mount",
  "foundation",
  "vegetation_obstruction",
  "bird_nest",
  "other",
] as const;
export type DefectCategory = (typeof DEFECT_CATEGORIES)[number];

export const DEFECT_CATEGORY_LABELS: Record<DefectCategory, string> = {
  corrosion: "Corrosion",
  coating_damage: "Coating damage",
  missing_fastener: "Missing fastener",
  loose_fastener: "Loose fastener",
  deformed_member: "Deformed member",
  weld_anomaly: "Weld anomaly",
  cable_issue: "Cable issue",
  antenna_mount: "Antenna / mount",
  foundation: "Foundation",
  vegetation_obstruction: "Vegetation / obstruction",
  bird_nest: "Bird nest",
  other: "Other",
};

/** Inspector-assigned follow-up priority. A documentation aid, not a structural rating. */
export const INSPECTOR_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type InspectorPriority = (typeof INSPECTOR_PRIORITIES)[number];

export const INSPECTOR_PRIORITY_LABELS: Record<InspectorPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/**
 * Engineering severity is deliberately separate from inspector priority. It may
 * only be recorded from an external assessment by a qualified engineer; the app
 * never derives it. New findings always start as `not_assessed`.
 */
export const ENGINEERING_SEVERITIES = [
  "not_assessed",
  "minor",
  "moderate",
  "major",
  "critical",
] as const;
export type EngineeringSeverity = (typeof ENGINEERING_SEVERITIES)[number];

export const ENGINEERING_SEVERITY_LABELS: Record<EngineeringSeverity, string> = {
  not_assessed: "Not assessed",
  minor: "Minor",
  moderate: "Moderate",
  major: "Major",
  critical: "Critical",
};

/**
 * `observation`: entered by the inspector, not yet reviewed.
 * `confirmed`: reviewed and accepted by the inspector. Not engineering certification.
 * `dismissed`: reviewed and rejected by the inspector.
 */
export const FINDING_STATUSES = ["observation", "confirmed", "dismissed"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  observation: "Observation",
  confirmed: "Confirmed finding",
  dismissed: "Dismissed",
};

/** Where a record came from. Only manual entry exists today. */
export const PROVENANCE_SOURCES = ["manual"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export const ANNOTATION_SHAPE_KINDS = ["rect", "point"] as const;
export type AnnotationShapeKind = (typeof ANNOTATION_SHAPE_KINDS)[number];

/** Returns true when `value` is one of the members of `options`. */
export function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}
