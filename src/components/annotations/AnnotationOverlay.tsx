import type { Ref } from "react";
import { HANDLES, handlePositions } from "@/lib/annotations/geometry";
import type { Annotation, AnnotationShape } from "@/lib/domain/types";
import { HALO_COLOR, annotationColor } from "./annotation-colors";

export interface OverlayItem {
  annotation: Annotation;
  /** Shape to draw (may be a live preview while dragging). */
  shape: AnnotationShape;
  number: number;
}

/**
 * SVG drawn exactly over the photograph. The viewBox uses the original image's
 * pixel dimensions, and shapes are stored as fractions of those, so the overlay
 * scales with the image at every zoom level. `pixel` is the size of one screen
 * pixel in image units, used to keep handles and labels a constant screen size.
 */
export function AnnotationOverlay({
  svgRef,
  imageWidth,
  imageHeight,
  items,
  selectedId,
  draft,
  pixel,
}: {
  svgRef: Ref<SVGSVGElement>;
  imageWidth: number;
  imageHeight: number;
  items: readonly OverlayItem[];
  selectedId: string | null;
  draft: AnnotationShape | null;
  pixel: number;
}) {
  const W = imageWidth;
  const H = imageHeight;

  return (
    <svg
      ref={svgRef}
      data-testid="annotation-overlay"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden="true"
    >
      {items.map(({ annotation, shape, number }) => {
        const color = annotationColor(annotation.label);
        const selected = annotation.id === selectedId;
        const strokeWidth = selected ? 3 : 2;
        if (shape.kind === "rect") {
          const x = shape.x * W;
          const y = shape.y * H;
          return (
            <g key={annotation.id} data-annotation-id={annotation.id} data-selected={selected || undefined}>
              <rect
                x={x}
                y={y}
                width={shape.width * W}
                height={shape.height * H}
                fill={color}
                fillOpacity={selected ? 0.18 : 0.06}
                stroke={HALO_COLOR}
                strokeWidth={strokeWidth + 3}
                strokeOpacity={0.7}
                vectorEffect="non-scaling-stroke"
              />
              <rect
                data-shape="rect"
                x={x}
                y={y}
                width={shape.width * W}
                height={shape.height * H}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
              <NumberBadge x={x} y={y} number={number} color={color} pixel={pixel} />
            </g>
          );
        }
        const cx = shape.x * W;
        const cy = shape.y * H;
        return (
          <g key={annotation.id} data-annotation-id={annotation.id} data-selected={selected || undefined}>
            {selected ? (
              <circle cx={cx} cy={cy} r={13 * pixel} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ) : null}
            <circle
              data-shape="point"
              cx={cx}
              cy={cy}
              r={6 * pixel}
              fill={color}
              stroke={HALO_COLOR}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <NumberBadge x={cx + 10 * pixel} y={cy - 22 * pixel} number={number} color={color} pixel={pixel} />
          </g>
        );
      })}

      {(() => {
        const selected = items.find((item) => item.annotation.id === selectedId);
        if (!selected || selected.shape.kind !== "rect") return null;
        const positions = handlePositions(selected.shape);
        const size = 9 * pixel;
        return (
          <g data-testid="resize-handles">
            {HANDLES.map((handle) => (
              <rect
                key={handle}
                data-handle={handle}
                x={positions[handle].x * W - size / 2}
                y={positions[handle].y * H - size / 2}
                width={size}
                height={size}
                fill="#ffffff"
                stroke={HALO_COLOR}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        );
      })()}

      {draft ? (
        <g data-testid="annotation-draft">
          {draft.kind === "rect" ? (
            <rect
              x={draft.x * W}
              y={draft.y * H}
              width={draft.width * W}
              height={draft.height * H}
              fill="#fbbf24"
              fillOpacity={0.12}
              stroke="#fbbf24"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <circle cx={draft.x * W} cy={draft.y * H} r={6 * pixel} fill="#fbbf24" fillOpacity={0.6} stroke={HALO_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )}
        </g>
      ) : null}
    </svg>
  );
}

function NumberBadge({ x, y, number, color, pixel }: { x: number; y: number; number: number; color: string; pixel: number }) {
  const r = 9 * pixel;
  return (
    <g>
      <circle cx={x + r} cy={y + r} r={r} fill={HALO_COLOR} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text
        x={x + r}
        y={y + r}
        fill="#ffffff"
        fontSize={11 * pixel}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {number}
      </text>
    </g>
  );
}
