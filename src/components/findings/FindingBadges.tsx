import type { ReactNode } from "react";
import { CircleCheck, CircleSlash, Eye, SignalHigh, SignalLow, SignalMedium, Siren } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import {
  FINDING_STATUS_LABELS,
  INSPECTOR_PRIORITY_LABELS,
  type FindingStatus,
  type InspectorPriority,
} from "@/lib/domain/constants";

/** Icons convey order/meaning so priority and status never rely on colour alone. */
export const PRIORITY_STYLE: Record<InspectorPriority, { tone: BadgeTone; icon: ReactNode }> = {
  low: { tone: "neutral", icon: <SignalLow aria-hidden="true" /> },
  medium: { tone: "info", icon: <SignalMedium aria-hidden="true" /> },
  high: { tone: "warning", icon: <SignalHigh aria-hidden="true" /> },
  urgent: { tone: "danger", icon: <Siren aria-hidden="true" /> },
};

export const STATUS_STYLE: Record<FindingStatus, { tone: BadgeTone; icon: ReactNode }> = {
  observation: { tone: "info", icon: <Eye aria-hidden="true" /> },
  confirmed: { tone: "success", icon: <CircleCheck aria-hidden="true" /> },
  dismissed: { tone: "neutral", icon: <CircleSlash aria-hidden="true" /> },
};

export function PriorityBadge({ priority }: { priority: InspectorPriority }) {
  const { tone, icon } = PRIORITY_STYLE[priority];
  return (
    <Badge tone={tone} icon={icon}>
      <span className="sr-only">Inspector priority: </span>
      {INSPECTOR_PRIORITY_LABELS[priority]} priority
    </Badge>
  );
}

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  const { tone, icon } = STATUS_STYLE[status];
  return (
    <Badge tone={tone} icon={icon}>
      <span className="sr-only">Status: </span>
      {FINDING_STATUS_LABELS[status]}
    </Badge>
  );
}

/** What each status means. Shown wherever status can be changed. */
export const STATUS_EXPLANATIONS: Record<FindingStatus, string> = {
  observation: "Recorded by the inspector, not yet reviewed.",
  confirmed: "Reviewed and accepted by the inspector. This is not an engineering certification.",
  dismissed: "Reviewed and rejected by the inspector. Kept for the record.",
};
