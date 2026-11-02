import type { AnnotationShape, PointShape, RectShape } from "@/lib/domain/types";

/**
 * Pure geometry for annotations. Shapes are stored in normalised image
 * coordinates: (0, 0) is the image's top-left corner and (1, 1) its
 * bottom-right, independent of how large the image is drawn on screen.
 */

export interface Point {
  x: number;
  y: number;
}

/** A screen rectangle, e.g. from `element.getBoundingClientRect()`. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Stored values are rounded to 6 decimals (0.01 px on a 10 000 px image). */
const PRECISION = 1e6;
/** Tolerance for floating-point error in validation. */
const EPSILON = 1e-6;

export const round6 = (value: number) => Math.round(value * PRECISION) / PRECISION;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const clamp01 = (value: number) => clamp(value, 0, 1);

/** Screen position → normalised image position (not clamped; may lie outside 0–1). */
export function screenToNormalized(screen: Point, imageRect: ScreenRect): Point {
  return {
    x: (screen.x - imageRect.left) / imageRect.width,
    y: (screen.y - imageRect.top) / imageRect.height,
  };
}

/** Normalised image position → screen position. */
export function normalizedToScreen(point: Point, imageRect: ScreenRect): Point {
  return {
    x: imageRect.left + point.x * imageRect.width,
    y: imageRect.top + point.y * imageRect.height,
  };
}

/** Converts a distance in screen pixels to normalised units on each axis. */
export function screenDistanceToNormalized(pixels: number, imageRect: ScreenRect): Point {
  return { x: pixels / imageRect.width, y: pixels / imageRect.height };
}

export function clampPoint(point: Point): Point {
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

/** A point annotation at `point`, clamped inside the image. */
export function createPoint(point: Point): PointShape {
  const p = clampPoint(point);
  return { kind: "point", x: round6(p.x), y: round6(p.y) };
}

/** Builds a rectangle from its edges, clamped inside the image and rounded consistently. */
function rectFromEdges(left: number, top: number, right: number, bottom: number): RectShape {
  const l = round6(clamp01(Math.min(left, right)));
  const r = round6(clamp01(Math.max(left, right)));
  const t = round6(clamp01(Math.min(top, bottom)));
  const b = round6(clamp01(Math.max(top, bottom)));
  return { kind: "rect", x: l, y: t, width: round6(r - l), height: round6(b - t) };
}

/** Rectangle spanning two corner points in any order (e.g. drag start and current position). */
export function rectFromPoints(a: Point, b: Point): RectShape {
  return rectFromEdges(a.x, a.y, b.x, b.y);
}

/** Moves a rectangle by a normalised delta without letting it leave the image. */
export function moveRect(rect: RectShape, delta: Point): RectShape {
  const x = clamp(rect.x + delta.x, 0, 1 - rect.width);
  const y = clamp(rect.y + delta.y, 0, 1 - rect.height);
  return { kind: "rect", x: round6(x), y: round6(y), width: rect.width, height: rect.height };
}

/** Moves a point by a normalised delta, clamped inside the image. */
export function movePoint(point: PointShape, delta: Point): PointShape {
  return createPoint({ x: point.x + delta.x, y: point.y + delta.y });
}

/** Moves any shape by a normalised delta. */
export function moveShape(shape: AnnotationShape, delta: Point): AnnotationShape {
  return shape.kind === "rect" ? moveRect(shape, delta) : movePoint(shape, delta);
}

/**
 * Drags one handle of a rectangle to `to`. The opposite edges stay fixed, the
 * dragged edges cannot cross them (the rectangle keeps at least `minSize`), and
 * every edge stays inside the image.
 */
export function resizeRect(rect: RectShape, handle: Handle, to: Point, minSize: Point): RectShape {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) left = clamp(to.x, 0, Math.max(0, right - minSize.x));
  if (handle.includes("e")) right = clamp(to.x, Math.min(1, left + minSize.x), 1);
  if (handle.includes("n")) top = clamp(to.y, 0, Math.max(0, bottom - minSize.y));
  if (handle.includes("s")) bottom = clamp(to.y, Math.min(1, top + minSize.y), 1);
  return rectFromEdges(left, top, right, bottom);
}

/** Normalised positions of the eight resize handles. */
export function handlePositions(rect: RectShape): Record<Handle, Point> {
  const { x, y, width: w, height: h } = rect;
  return {
    nw: { x, y },
    n: { x: x + w / 2, y },
    ne: { x: x + w, y },
    e: { x: x + w, y: y + h / 2 },
    se: { x: x + w, y: y + h },
    s: { x: x + w / 2, y: y + h },
    sw: { x, y: y + h },
    w: { x, y: y + h / 2 },
  };
}

/** Distance in "tolerance units", so x and y tolerances can differ (non-square images). */
function scaledDistance(a: Point, b: Point, tolerance: Point): number {
  return Math.hypot((a.x - b.x) / tolerance.x, (a.y - b.y) / tolerance.y);
}

/** The resize handle under `point` (nearest within `tolerance`), if any. */
export function hitHandle(rect: RectShape, point: Point, tolerance: Point): Handle | undefined {
  const positions = handlePositions(rect);
  let best: { handle: Handle; distance: number } | undefined;
  for (const handle of HANDLES) {
    const distance = scaledDistance(positions[handle], point, tolerance);
    if (distance <= 1 && (!best || distance < best.distance)) best = { handle, distance };
  }
  return best?.handle;
}

export interface Hittable {
  id: string;
  shape: AnnotationShape;
}

/**
 * The annotation under `point`. Points win over rectangles (they are small and
 * would otherwise be unreachable inside a rectangle); among the same kind, the
 * one drawn last (top-most) wins. Rectangles are hit anywhere inside, with a
 * tolerance margin around the edges.
 */
export function hitTest(items: readonly Hittable[], point: Point, tolerance: Point): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.shape.kind === "point" && scaledDistance(item.shape, point, tolerance) <= 1) return item.id;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.shape.kind !== "rect") continue;
    const { x, y, width, height } = item.shape;
    if (
      point.x >= x - tolerance.x &&
      point.x <= x + width + tolerance.x &&
      point.y >= y - tolerance.y &&
      point.y <= y + height + tolerance.y
    ) {
      return item.id;
    }
  }
  return undefined;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const inUnitRange = (value: number) => value >= -EPSILON && value <= 1 + EPSILON;

/** True for a well-formed shape that lies entirely inside the image. */
export function isValidShape(value: unknown): value is AnnotationShape {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  if (!isFiniteNumber(s.x) || !isFiniteNumber(s.y) || !inUnitRange(s.x) || !inUnitRange(s.y)) return false;
  if (s.kind === "point") return Object.keys(s).length === 3;
  if (s.kind === "rect") {
    return (
      isFiniteNumber(s.width) &&
      isFiniteNumber(s.height) &&
      s.width > 0 &&
      s.height > 0 &&
      s.x + s.width <= 1 + EPSILON &&
      s.y + s.height <= 1 + EPSILON &&
      Object.keys(s).length === 5
    );
  }
  return false;
}

/** True when the rectangle is at least `minSize` on both axes. */
export function meetsMinimumSize(rect: RectShape, minSize: Point): boolean {
  return rect.width >= minSize.x - EPSILON && rect.height >= minSize.y - EPSILON;
}

export function shapesEqual(a: AnnotationShape, b: AnnotationShape): boolean {
  if (a.kind === "rect" && b.kind === "rect") {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  }
  return a.kind === b.kind && a.x === b.x && a.y === b.y;
}
