import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import type { DamagedRecord } from "@/lib/storage/inspections";
import { describeDamagedRecords } from "./damaged-records";

export interface DamagedRecordsWarningProps {
  records: readonly DamagedRecord[];
  onRetry: () => void;
}

/** Tells the user that some stored inspections exist but cannot be displayed. */
export function DamagedRecordsWarning({ records, onRetry }: DamagedRecordsWarningProps) {
  const { title, detail } = describeDamagedRecords(records.length);
  return (
    <Callout tone="warning" title={title}>
      <p>{detail}</p>
      <details className="mt-2">
        <summary className="cursor-pointer font-medium">
          Show record {records.length === 1 ? "ID" : "IDs"}
        </summary>
        <ul className="mt-1 space-y-0.5 font-mono text-xs break-all">
          {records.map((record) => (
            <li key={record.key}>{record.key}</li>
          ))}
        </ul>
      </details>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
        <RotateCw aria-hidden="true" />
        Try again
      </Button>
    </Callout>
  );
}
