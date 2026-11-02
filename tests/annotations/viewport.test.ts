import { describe, expect, it } from "vitest";
import { screenToNormalized } from "@/lib/annotations/geometry";
import {
  INITIAL_VIEW,
  MAX_ZOOM,
  clampView,
  fitContain,
  panBy,
  stageLayout,
  stepZoom,
  zoomAt,
} from "@/lib/annotations/viewport";

const container = { width: 1000, height: 600 };
const image = { width: 4000, height: 3000 };
const base = fitContain(container, image); // 800 × 600

describe("fitContain", () => {
  it("fits the image inside the viewport without distortion", () => {
    expect(base).toEqual({ width: 800, height: 600 });
    expect(fitContain({ width: 300, height: 600 }, { width: 1600, height: 1200 })).toEqual({ width: 300, height: 225 });
  });
});

describe("stageLayout", () => {
  it("centres the image at zoom 1", () => {
    expect(stageLayout(INITIAL_VIEW, base, container)).toEqual({ left: 100, top: 0, width: 800, height: 600 });
  });
});

describe("clampView", () => {
  it("keeps the image centred when it fits on an axis", () => {
    expect(clampView({ zoom: 1, center: { x: 0.1, y: 0.9 } }, base, container).center).toEqual({ x: 0.5, y: 0.5 });
  });

  it("stops panning at the image edges when zoomed", () => {
    const view = clampView({ zoom: 2, center: { x: 0, y: 1 } }, base, container);
    const stage = stageLayout(view, base, container);
    expect(stage.left).toBe(0); // left edge of the image at the left edge of the viewport
    expect(stage.top + stage.height).toBe(container.height); // bottom edge at the bottom
  });

  it("limits zoom to the supported range", () => {
    expect(clampView({ zoom: 50, center: { x: 0.5, y: 0.5 } }, base, container).zoom).toBe(MAX_ZOOM);
    expect(clampView({ zoom: 0.1, center: { x: 0.5, y: 0.5 } }, base, container).zoom).toBe(1);
  });
});

describe("zoomAt", () => {
  it("keeps the image point under the focus fixed", () => {
    const focus = { x: 300, y: 200 };
    const before = stageLayout(INITIAL_VIEW, base, container);
    const imagePoint = screenToNormalized(focus, before);

    const view = zoomAt(INITIAL_VIEW, 2, focus, base, container);
    const after = stageLayout(view, base, container);
    const sameScreen = { x: after.left + imagePoint.x * after.width, y: after.top + imagePoint.y * after.height };
    expect(sameScreen.x).toBeCloseTo(focus.x, 9);
    expect(sameScreen.y).toBeCloseTo(focus.y, 9);
  });

  it("returns to the centred layout when zooming back out to 1", () => {
    const zoomed = zoomAt(INITIAL_VIEW, 4, { x: 900, y: 50 }, base, container);
    expect(zoomAt(zoomed, 1, { x: 500, y: 300 }, base, container)).toEqual(INITIAL_VIEW);
  });
});

describe("panBy", () => {
  it("moves the image with the pointer when zoomed", () => {
    const zoomed = { zoom: 2, center: { x: 0.5, y: 0.5 } };
    const before = stageLayout(zoomed, base, container);
    const after = stageLayout(panBy(zoomed, { x: 50, y: -30 }, base, container), base, container);
    expect(after.left - before.left).toBeCloseTo(50, 9);
    expect(after.top - before.top).toBeCloseTo(-30, 9);
  });

  it("does nothing at zoom 1 (the whole image is already visible)", () => {
    expect(panBy(INITIAL_VIEW, { x: 200, y: 200 }, base, container)).toEqual(INITIAL_VIEW);
  });
});

describe("stepZoom", () => {
  it("steps through the zoom levels and stops at the limits", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, -1)).toBe(1);
    expect(stepZoom(2.5, 1)).toBe(3);
    expect(stepZoom(8, 1)).toBe(8);
    expect(stepZoom(1, -1)).toBe(1);
  });
});
