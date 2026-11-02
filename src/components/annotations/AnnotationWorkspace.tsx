"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import {
  createPoint,
  hitHandle,
  hitTest,
  meetsMinimumSize,
  moveShape,
  rectFromPoints,
  resizeRect,
  screenDistanceToNormalized,
  screenToNormalized,
  shapesEqual,
  type Handle,
  type Point,
} from "@/lib/annotations/geometry";
import {
  INITIAL_VIEW,
  clampView,
  fitContain,
  panBy,
  stageLayout,
  stepZoom,
  zoomAt,
  type Size,
  type View,
} from "@/lib/annotations/viewport";
import type { AnnotationShape, ID, PhotoRecord, RectShape } from "@/lib/domain/types";
import { AnnotationOverlay, type OverlayItem } from "./AnnotationOverlay";
import { AnnotationPanel } from "./AnnotationPanel";
import { AnnotationToolbar, type Tool } from "./AnnotationToolbar";
import { useAnnotations } from "./useAnnotations";

/** Screen-pixel thresholds, converted to image units at the current zoom. */
const HIT_PX = { mouse: 8, touch: 16 };
const MIN_RECT_PX = 6;
const DRAG_THRESHOLD_PX = 3;

type Drag =
  | { kind: "draw"; pointerId: number; start: Point }
  | { kind: "point"; pointerId: number }
  | { kind: "move"; pointerId: number; id: ID; original: AnnotationShape; start: Point; startScreen: Point }
  | { kind: "resize"; pointerId: number; id: ID; original: RectShape; handle: Handle }
  | { kind: "pan"; pointerId: number; startScreen: Point; startView: View };

/** A live shape shown while dragging; committed on pointer up. */
type Preview = { id: ID | "draft"; shape: AnnotationShape } | null;

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

const TOOL_HINTS: Record<Tool, string> = {
  select: "Click an annotation to select it, drag to move it, drag a handle to resize. When zoomed in, drag empty space to pan.",
  rect: "Drag on the photograph to draw a rectangle.",
  point: "Click or tap on the photograph to place a point.",
};

export function AnnotationWorkspace({
  photo,
  imageUrl,
  recordedBy,
  sidebar,
}: {
  photo: PhotoRecord;
  /** Object URL of the original image. */
  imageUrl: string;
  recordedBy: string;
  /** Extra cards shown below the annotation panel. */
  sidebar?: ReactNode;
}) {
  const { items, load, save, create, update, setLabel, remove, retry } = useAnnotations(photo, recordedBy);
  const [tool, setTool] = useState<Tool>("select");
  const [rawSelectedId, setSelectedId] = useState<ID | null>(null);
  // A selection whose annotation disappeared (e.g. reverted after a failed save) counts as none.
  const selectedId = rawSelectedId && items.some((a) => a.id === rawSelectedId) ? rawSelectedId : null;
  const [preview, setPreviewState] = useState<Preview>(null);
  const [cursor, setCursor] = useState("default");
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [container, setContainer] = useState<Size | null>(null);
  const [dimensionWarning, setDimensionWarning] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const previewRef = useRef<Preview>(null);

  const setPreview = useCallback((next: Preview) => {
    previewRef.current = next;
    setPreviewState(next);
  }, []);

  // Track the viewport size so the image always fits and the view can be clamped.
  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainer((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const image = useMemo(() => ({ width: photo.width, height: photo.height }), [photo.width, photo.height]);
  const base = container ? fitContain(container, image) : null;
  const effectiveView = base && container ? clampView(view, base, container) : view;
  const layout = base && container ? stageLayout(effectiveView, base, container) : null;
  /** One screen pixel, in image pixel units. */
  const pixel = layout ? photo.width / layout.width : 1;

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      if (!base || !container) return;
      const focus = { x: container.width / 2, y: container.height / 2 };
      setView((v) => zoomAt(clampView(v, base, container), stepZoom(v.zoom, direction), focus, base, container));
    },
    [base, container],
  );
  const resetView = useCallback(() => setView(INITIAL_VIEW), []);

  const changeTool = useCallback((next: Tool) => {
    setTool(next);
    if (next !== "select") setSelectedId(null);
  }, []);

  /** Image geometry for a pointer event: normalised position plus tolerances. */
  function measure(event: PointerEvent<HTMLDivElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const hitPx = event.pointerType === "mouse" ? HIT_PX.mouse : HIT_PX.touch;
    return {
      point: screenToNormalized({ x: event.clientX, y: event.clientY }, rect),
      tolerance: screenDistanceToNormalized(hitPx, rect),
      minSize: screenDistanceToNormalized(MIN_RECT_PX, rect),
    };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (drag.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const m = measure(event);
    if (!m || !base || !container) return;
    event.preventDefault(); // no text selection or native image drag
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    const { pointerId } = event;

    if (tool === "rect") {
      drag.current = { kind: "draw", pointerId, start: m.point };
      setPreview({ id: "draft", shape: rectFromPoints(m.point, m.point) });
      return;
    }
    if (tool === "point") {
      drag.current = { kind: "point", pointerId };
      setPreview({ id: "draft", shape: createPoint(m.point) });
      return;
    }

    const selected = items.find((a) => a.id === selectedId);
    if (selected?.shape.kind === "rect") {
      const handle = hitHandle(selected.shape, m.point, m.tolerance);
      if (handle) {
        drag.current = { kind: "resize", pointerId, id: selected.id, original: selected.shape, handle };
        return;
      }
    }
    const hit = hitTest(
      items.map((a) => ({ id: a.id, shape: a.shape })),
      m.point,
      m.tolerance,
    );
    if (hit) {
      const target = items.find((a) => a.id === hit);
      setSelectedId(hit);
      if (target) {
        drag.current = {
          kind: "move",
          pointerId,
          id: hit,
          original: target.shape,
          start: m.point,
          startScreen: { x: event.clientX, y: event.clientY },
        };
      }
      return;
    }
    setSelectedId(null);
    drag.current = { kind: "pan", pointerId, startScreen: { x: event.clientX, y: event.clientY }, startView: effectiveView };
    setCursor(effectiveView.zoom > 1 ? "grabbing" : "default");
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const m = measure(event);
    if (!m) return;

    if (!d) {
      // Hover feedback only.
      if (tool !== "select") return setCursor("crosshair");
      const selected = items.find((a) => a.id === selectedId);
      const handle = selected?.shape.kind === "rect" ? hitHandle(selected.shape, m.point, m.tolerance) : undefined;
      if (handle) return setCursor(HANDLE_CURSORS[handle]);
      const hit = hitTest(items.map((a) => ({ id: a.id, shape: a.shape })), m.point, m.tolerance);
      return setCursor(hit ? "move" : effectiveView.zoom > 1 ? "grab" : "default");
    }
    if (event.pointerId !== d.pointerId) return;

    switch (d.kind) {
      case "draw":
        setPreview({ id: "draft", shape: rectFromPoints(d.start, m.point) });
        break;
      case "point":
        setPreview({ id: "draft", shape: createPoint(m.point) });
        break;
      case "move": {
        const moved = Math.hypot(event.clientX - d.startScreen.x, event.clientY - d.startScreen.y) >= DRAG_THRESHOLD_PX;
        if (moved || previewRef.current) {
          setPreview({ id: d.id, shape: moveShape(d.original, { x: m.point.x - d.start.x, y: m.point.y - d.start.y }) });
        }
        break;
      }
      case "resize":
        setPreview({ id: d.id, shape: resizeRect(d.original, d.handle, m.point, m.minSize) });
        break;
      case "pan":
        if (base && container) {
          setView(panBy(d.startView, { x: event.clientX - d.startScreen.x, y: event.clientY - d.startScreen.y }, base, container));
        }
        break;
    }
  }

  /** Ends the current interaction; only a normal pointer-up commits changes. */
  function finish(commit: boolean, event?: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || (event && event.pointerId !== d.pointerId)) return;
    drag.current = null;
    const result = previewRef.current;
    setPreview(null);
    if (d.kind === "pan") setCursor(effectiveView.zoom > 1 ? "grab" : "default");
    if (!commit || !result) return;

    if (d.kind === "draw" && result.shape.kind === "rect") {
      const m = event ? measure(event) : null;
      if (m && meetsMinimumSize(result.shape, m.minSize)) setSelectedId(create(result.shape));
    } else if (d.kind === "point") {
      setSelectedId(create(result.shape));
    } else if ((d.kind === "move" || d.kind === "resize") && !shapesEqual(d.original, result.shape)) {
      update(d.id, { shape: result.shape });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    switch (event.key) {
      case "Escape":
        if (drag.current) finish(false);
        else setSelectedId(null);
        break;
      case "v":
      case "V":
        changeTool("select");
        break;
      case "r":
      case "R":
        changeTool("rect");
        break;
      case "p":
      case "P":
        changeTool("point");
        break;
      case "+":
      case "=":
        zoomBy(1);
        break;
      case "-":
        zoomBy(-1);
        break;
      case "0":
        resetView();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const overlayItems: OverlayItem[] = items.map((annotation, index) => ({
    annotation,
    shape: preview && preview.id === annotation.id ? preview.shape : annotation.shape,
    number: index + 1,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-3" onKeyDown={onKeyDown}>
      <div className="min-w-0 space-y-2 lg:col-span-2">
        <AnnotationToolbar
          tool={tool}
          onToolChange={changeTool}
          zoom={effectiveView.zoom}
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onResetView={resetView}
          save={save}
        />
        <div
          ref={viewportRef}
          data-testid="annotation-viewport"
          data-tool={tool}
          tabIndex={0}
          aria-label={`Annotation workspace for ${photo.fileName}. ${TOOL_HINTS[tool]}`}
          role="application"
          // Sized to the photo's aspect ratio (no letterboxing at 100%), capped for tall portraits.
          className="relative max-h-[70vh] min-h-56 w-full touch-none select-none overflow-hidden rounded-lg bg-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          style={{ cursor, aspectRatio: `${photo.width} / ${photo.height}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(true, e)}
          onPointerCancel={(e) => finish(false, e)}
          onLostPointerCapture={(e) => finish(false, e)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {layout ? (
            <div
              data-testid="annotation-stage"
              className="absolute"
              style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL; next/image cannot optimise it */}
              <img
                src={imageUrl}
                alt={photo.caption ?? photo.fileName}
                draggable={false}
                className="absolute inset-0 size-full"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setDimensionWarning(img.naturalWidth !== photo.width || img.naturalHeight !== photo.height);
                }}
              />
              <AnnotationOverlay
                svgRef={svgRef}
                imageWidth={photo.width}
                imageHeight={photo.height}
                items={overlayItems}
                selectedId={selectedId}
                draft={preview?.id === "draft" ? preview.shape : null}
                pixel={pixel}
              />
            </div>
          ) : null}
        </div>
        <p className="text-xs text-slate-500" data-testid="tool-hint">
          {TOOL_HINTS[tool]} Coordinates are saved relative to the original image.
        </p>
        {dimensionWarning ? (
          <Callout tone="warning" title="Image size differs from the recorded metadata">
            The displayed image does not match the dimensions recorded at upload. Annotations are still stored relative to
            the image, but check their placement.
          </Callout>
        ) : null}
        {save.status === "error" ? (
          <Callout tone="danger" title="The last change could not be saved">
            {save.message} The annotations shown have been reloaded from storage.
          </Callout>
        ) : null}
      </div>

      <div className="space-y-6">
        {load.status === "error" ? (
          <Callout tone="danger" title="Annotations could not be loaded">
            <p>{load.message}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </Callout>
        ) : (
          <AnnotationPanel
            photo={photo}
            annotations={items}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              if (id) setTool("select");
            }}
            onLabelChange={setLabel}
            onDelete={(id) => {
              remove(id);
              setSelectedId(null);
            }}
            damagedCount={load.status === "ready" ? load.damagedCount : 0}
          />
        )}
        {sidebar}
      </div>
    </div>
  );
}
