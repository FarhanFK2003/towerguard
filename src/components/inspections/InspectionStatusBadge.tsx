import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { INSPECTION_STATUS_LABELS, type InspectionStatus } from "@/lib/domain/constants";

const TONES: Record<InspectionStatus, BadgeTone> = {
  draft: "neutral",
  in_review: "info",
  finalised: "success",
};

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  return <Badge tone={TONES[status]}>{INSPECTION_STATUS_LABELS[status]}</Badge>;
}
