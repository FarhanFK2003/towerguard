import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, LoaderCircle, Lock, MapPin, Maximize, MousePointer2, Square, ZoomIn, ZoomOut } from "lucide-react";
import { MAX_ZOOM, MIN_ZOOM } from "@/lib/annotations/viewport";
import { cn } from "@/lib/cn";
import type { SaveState } from "./useAnnotations";

export type Tool = "select" | "rect" | "point";

const TOOLS: readonly { tool: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  { tool: "select", label: "Select", shortcut: "V", icon: <MousePointer2 /> },
  { tool: "rect", label: "Rectangle", shortcut: "R", icon: <Square /> },
  { tool: "point", label: "Point", shortcut: "P", icon: <MapPin /> },
];

const ICON_BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-4";

export function AnnotationToolbar({
  tool,
  onToolChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
  save,
  readOnly = false,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  save: SaveState;
  /** Only Select (for viewing) and zoom stay available. */
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-1">
        <div role="toolbar" aria-label="Annotation tools" className="flex gap-1">
          {TOOLS.map(({ tool: t, label, shortcut, icon }) => (
            <button
              key={t}
              type="button"
              aria-pressed={tool === t}
              title={readOnly && t !== "select" ? `${label} (unavailable: inspection finalised)` : `${label} (${shortcut})`}
              disabled={readOnly && t !== "select"}
              onClick={() => onToolChange(t)}
              className={cn(
                ICON_BUTTON,
                tool === t ? "bg-slate-900 text-amber-300 shadow-inner" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden="true" />
        <div role="group" aria-label="Zoom" className="flex items-center gap-1">
          <button type="button" className={cn(ICON_BUTTON, "text-slate-700 hover:bg-slate-100")} onClick={onZoomOut} disabled={zoom <= MIN_ZOOM} title="Zoom out (−)">
            <ZoomOut />
            <span className="sr-only">Zoom out</span>
          </button>
          <span className="w-12 text-center text-sm tabular-nums text-slate-700" data-testid="zoom-level" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className={cn(ICON_BUTTON, "text-slate-700 hover:bg-slate-100")} onClick={onZoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom in (+)">
            <ZoomIn />
            <span className="sr-only">Zoom in</span>
          </button>
          <button type="button" className={cn(ICON_BUTTON, "text-slate-700 hover:bg-slate-100")} onClick={onResetView} title="Reset view (0)">
            <Maximize />
            Reset view
          </button>
        </div>
      </div>
      {readOnly ? (
        <p className="inline-flex items-center gap-1.5 px-2 text-sm text-slate-600" data-testid="save-status" data-save-status="read-only">
          <Lock className="size-4" aria-hidden="true" />
          Read-only
        </p>
      ) : (
        <SaveStatus save={save} />
      )}
    </div>
  );
}

function SaveStatus({ save }: { save: SaveState }) {
  const content =
    save.status === "saving" ? (
      <span className="text-slate-600">
        <LoaderCircle className="animate-spin" aria-hidden="true" /> Saving…
      </span>
    ) : save.status === "saved" ? (
      <span className="text-emerald-700">
        <CircleCheck aria-hidden="true" /> All changes saved
      </span>
    ) : save.status === "error" ? (
      <span className="text-red-700" title={save.message}>
        <CircleAlert aria-hidden="true" /> Save failed: changes reverted
      </span>
    ) : (
      <span className="text-slate-500">Changes save automatically</span>
    );
  return (
    <p role="status" data-testid="save-status" data-save-status={save.status} className="px-2 text-sm [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1.5 [&_svg]:size-4">
      {content}
    </p>
  );
}
