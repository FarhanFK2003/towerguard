import { CircleCheck, Eye } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

/** Explains the distinction between an observation and a confirmed finding. */
export function StatusDefinitions() {
  return (
    <dl className="space-y-4 text-sm">
      <div className="space-y-1">
        <dt>
          <Badge tone="info" icon={<Eye aria-hidden="true" />}>
            Observation
          </Badge>
        </dt>
        <dd className="text-slate-600">
          A potential issue entered manually by the inspector. Not yet reviewed.
        </dd>
      </div>
      <div className="space-y-1">
        <dt>
          <Badge tone="success" icon={<CircleCheck aria-hidden="true" />}>
            Confirmed finding
          </Badge>
        </dt>
        <dd className="text-slate-600">
          An observation the inspector has reviewed and accepted. It is a documentation status and{" "}
          <strong className="font-medium text-slate-800">
            does not constitute engineering certification
          </strong>{" "}
          or a structural assessment.
        </dd>
      </div>
    </dl>
  );
}
