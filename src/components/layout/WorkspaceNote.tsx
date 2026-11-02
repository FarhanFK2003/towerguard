import { HardDrive } from "lucide-react";

/** Sidebar footer stating where data lives. */
export function WorkspaceNote() {
  return (
    <div className="flex gap-3 rounded-md bg-white/5 p-3 text-xs text-slate-400">
      <HardDrive className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
      <p className="leading-relaxed">
        <span className="font-medium text-slate-300">Local-only workspace.</span> Inspection data is
        stored in this browser and is not uploaded to any server.
      </p>
    </div>
  );
}
