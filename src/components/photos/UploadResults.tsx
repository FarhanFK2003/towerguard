import type { ReactNode } from "react";
import { Ban, CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBytes } from "@/lib/format";
import { FINISHED_STATUSES, type UploadItem, type UploadStatus } from "./usePhotoUpload";

const STATUS: Record<UploadStatus, { label: string; icon: ReactNode }> = {
  queued: { label: "Waiting", icon: <Clock className="text-slate-400" /> },
  processing: { label: "Processing…", icon: <LoaderCircle className="animate-spin text-amber-600" /> },
  saved: { label: "Uploaded", icon: <CircleCheck className="text-emerald-600" /> },
  rejected: { label: "Not accepted", icon: <Ban className="text-red-600" /> },
  failed: { label: "Failed", icon: <CircleAlert className="text-red-600" /> },
};

export function UploadResults({
  items,
  busy,
  onDismiss,
}: {
  items: readonly UploadItem[];
  busy: boolean;
  onDismiss: () => void;
}) {
  const finished = items.filter((item) => FINISHED_STATUSES.includes(item.status)).length;
  const saved = items.filter((item) => item.status === "saved").length;
  const problems = items.filter((item) => item.status === "rejected" || item.status === "failed").length;

  const summary = busy
    ? `Uploading… ${finished} of ${items.length} done`
    : `${saved} of ${items.length} uploaded${problems > 0 ? ` · ${problems} not uploaded` : ""}`;

  return (
    <section
      aria-label="Upload results"
      className={`overflow-hidden rounded-md border ${problems > 0 && !busy ? "border-red-200" : "border-slate-200"}`}
    >
      <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2">
        <p className="text-sm font-medium text-slate-900" role="status" aria-live="polite">
          {summary}
        </p>
        {busy ? null : (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>
      {busy ? (
        <div className="h-1 bg-slate-200" aria-hidden="true">
          <div
            className="h-full bg-amber-500 transition-[width]"
            style={{ width: `${(finished / items.length) * 100}%` }}
          />
        </div>
      ) : null}
      <ul className="divide-y divide-slate-100">
        {items.map((item) => {
          const { label, icon } = STATUS[item.status];
          const isProblem = item.status === "rejected" || item.status === "failed";
          return (
            <li key={item.key} data-upload-status={item.status} className="flex items-start gap-2.5 px-3 py-2 text-sm">
              <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden="true">
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900" title={item.fileName}>
                  {item.fileName}{" "}
                  <span className="font-normal text-slate-500">({formatBytes(item.sizeBytes)})</span>
                </p>
                {item.message ? (
                  <p className={isProblem ? "text-red-700" : "text-slate-500"}>{item.message}</p>
                ) : null}
              </div>
              <span className={`shrink-0 text-xs ${isProblem ? "font-medium text-red-700" : "text-slate-500"}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
