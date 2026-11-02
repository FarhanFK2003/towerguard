import type { AnnotationLabel } from "@/lib/domain/constants";

/**
 * Stroke colours per label. Each is drawn over a dark halo so it stays visible
 * on both bright sky and dark steel. Colour is never the only cue: shapes are
 * numbered and the list shows the label text.
 */
export const LABEL_COLORS: Record<AnnotationLabel | "none", string> = {
  corrosion: "#f97316", // orange
  coating_damage: "#facc15", // yellow
  deformation: "#ef4444", // red
  missing_component: "#c084fc", // purple
  connection_issue: "#38bdf8", // sky blue
  other: "#2dd4bf", // teal
  none: "#f8fafc", // white
};

export const HALO_COLOR = "#0f172a";

export function annotationColor(label: AnnotationLabel | undefined): string {
  return LABEL_COLORS[label ?? "none"];
}
