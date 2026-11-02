import { clamp, type Point } from "./geometry";

/**
 * Pure zoom/pan maths for the annotation workspace. The view is described by a
 * zoom factor and the normalised image point shown at the centre of the
 * viewport, so it stays correct when the viewport is resized.
 */

export interface Size {
  width: number;
  height: number;
}

export interface View {
  zoom: number;
  /** Normalised image point at the centre of the viewport. */
  center: Point;
}

export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8] as const;
export const MIN_ZOOM = ZOOM_LEVELS[0];
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1] ?? 8;

export const INITIAL_VIEW: View = { zoom: 1, center: { x: 0.5, y: 0.5 } };

/** Largest size with the image's aspect ratio that fits inside `container` (zoom 1). */
export function fitContain(container: Size, image: Size): Size {
  const scale = Math.min(container.width / image.width, container.height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/**
 * Keeps the image covering the viewport: when the zoomed image is smaller than
 * the viewport on an axis it is centred, otherwise its edges cannot be panned
 * inside the viewport.
 */
export function clampView(view: View, base: Size, container: Size): View {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const halfX = container.width / (2 * base.width * zoom);
  const halfY = container.height / (2 * base.height * zoom);
  return {
    zoom,
    center: {
      x: halfX >= 0.5 ? 0.5 : clamp(view.center.x, halfX, 1 - halfX),
      y: halfY >= 0.5 ? 0.5 : clamp(view.center.y, halfY, 1 - halfY),
    },
  };
}

/** Where to draw the image (relative to the viewport's top-left) for this view. */
export function stageLayout(view: View, base: Size, container: Size) {
  const width = base.width * view.zoom;
  const height = base.height * view.zoom;
  return {
    left: container.width / 2 - view.center.x * width,
    top: container.height / 2 - view.center.y * height,
    width,
    height,
  };
}

/** Pans by a screen-pixel delta (dragging right moves the image right). */
export function panBy(view: View, delta: Point, base: Size, container: Size): View {
  return clampView(
    {
      zoom: view.zoom,
      center: {
        x: view.center.x - delta.x / (base.width * view.zoom),
        y: view.center.y - delta.y / (base.height * view.zoom),
      },
    },
    base,
    container,
  );
}

/** Zooms so the image point under `focus` (viewport coordinates) stays under it. */
export function zoomAt(view: View, zoom: number, focus: Point, base: Size, container: Size): View {
  const nextZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const offsetX = focus.x - container.width / 2;
  const offsetY = focus.y - container.height / 2;
  const imageX = view.center.x + offsetX / (base.width * view.zoom);
  const imageY = view.center.y + offsetY / (base.height * view.zoom);
  return clampView(
    {
      zoom: nextZoom,
      center: {
        x: imageX - offsetX / (base.width * nextZoom),
        y: imageY - offsetY / (base.height * nextZoom),
      },
    },
    base,
    container,
  );
}

/** The next zoom level up (`direction` 1) or down (-1). */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  if (direction === 1) return ZOOM_LEVELS.find((level) => level > zoom + 1e-9) ?? MAX_ZOOM;
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 1e-9) ?? MIN_ZOOM;
}
