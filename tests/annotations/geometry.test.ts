import { describe, expect, it } from "vitest";
import {
  createPoint,
  handlePositions,
  hitHandle,
  hitTest,
  isValidShape,
  meetsMinimumSize,
  movePoint,
  moveRect,
  normalizedToScreen,
  rectFromPoints,
  resizeRect,
  screenDistanceToNormalized,
  screenToNormalized,
  shapesEqual,
  type ScreenRect,
} from "@/lib/annotations/geometry";
import type { RectShape } from "@/lib/domain/types";

// An image drawn 800×400 px, offset by (100, 50) on screen.
const IMAGE: ScreenRect = { left: 100, top: 50, width: 800, height: 400 };
const rect = (x: number, y: number, width: number, height: number): RectShape => ({ kind: "rect", x, y, width, height });

describe("screen ↔ normalised conversion", () => {
  it("maps the image corners and centre", () => {
    expect(screenToNormalized({ x: 100, y: 50 }, IMAGE)).toEqual({ x: 0, y: 0 });
    expect(screenToNormalized({ x: 900, y: 450 }, IMAGE)).toEqual({ x: 1, y: 1 });
    expect(screenToNormalized({ x: 500, y: 250 }, IMAGE)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("uses separate x and y scales for non-square display", () => {
    expect(screenToNormalized({ x: 180, y: 90 }, IMAGE)).toEqual({ x: 0.1, y: 0.1 });
  });

  it("does not clamp positions outside the image", () => {
    expect(screenToNormalized({ x: 0, y: 0 }, IMAGE)).toEqual({ x: -0.125, y: -0.125 });
  });

  it("round-trips for any zoom (a larger, offset image rect)", () => {
    const zoomed: ScreenRect = { left: -1234.5, top: -310, width: 6400, height: 3200 };
    const p = { x: 0.3721, y: 0.8833 };
    const back = screenToNormalized(normalizedToScreen(p, zoomed), zoomed);
    expect(back.x).toBeCloseTo(p.x, 10);
    expect(back.y).toBeCloseTo(p.y, 10);
  });

  it("converts screen distances per axis", () => {
    expect(screenDistanceToNormalized(8, IMAGE)).toEqual({ x: 0.01, y: 0.02 });
  });
});

describe("creating shapes", () => {
  it("creates a rectangle from corners dragged in any direction", () => {
    expect(rectFromPoints({ x: 0.6, y: 0.7 }, { x: 0.2, y: 0.3 })).toEqual(rect(0.2, 0.3, 0.4, 0.4));
  });

  it("clamps rectangles drawn past the image edges", () => {
    expect(rectFromPoints({ x: -0.5, y: 0.5 }, { x: 0.25, y: 1.7 })).toEqual(rect(0, 0.5, 0.25, 0.5));
  });

  it("rounds to 6 decimals without letting the rectangle exceed the image", () => {
    const r = rectFromPoints({ x: 0.1234564999, y: 0 }, { x: 1.0000001, y: 1 });
    expect(r.x).toBe(0.123456);
    expect(r.x + r.width).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("creates points clamped inside the image", () => {
    expect(createPoint({ x: 0.25, y: 0.75 })).toEqual({ kind: "point", x: 0.25, y: 0.75 });
    expect(createPoint({ x: -1, y: 2 })).toEqual({ kind: "point", x: 0, y: 1 });
  });

  it("checks the minimum size on both axes", () => {
    expect(meetsMinimumSize(rect(0, 0, 0.05, 0.05), { x: 0.01, y: 0.01 })).toBe(true);
    expect(meetsMinimumSize(rect(0, 0, 0.05, 0.005), { x: 0.01, y: 0.01 })).toBe(false);
  });
});

describe("moving shapes", () => {
  it("moves a rectangle and keeps its size", () => {
    expect(moveRect(rect(0.2, 0.2, 0.3, 0.1), { x: 0.1, y: -0.05 })).toEqual(rect(0.3, 0.15, 0.3, 0.1));
  });

  it("stops a rectangle at the image edges instead of detaching it", () => {
    expect(moveRect(rect(0.6, 0.6, 0.3, 0.3), { x: 0.5, y: 0.5 })).toEqual(rect(0.7, 0.7, 0.3, 0.3));
    expect(moveRect(rect(0.1, 0.1, 0.3, 0.3), { x: -0.5, y: -0.5 })).toEqual(rect(0, 0, 0.3, 0.3));
  });

  it("moves points and clamps them inside the image", () => {
    expect(movePoint({ kind: "point", x: 0.5, y: 0.5 }, { x: 0.1, y: 0.2 })).toEqual({ kind: "point", x: 0.6, y: 0.7 });
    expect(movePoint({ kind: "point", x: 0.9, y: 0.1 }, { x: 0.5, y: -0.5 })).toEqual({ kind: "point", x: 1, y: 0 });
  });
});

describe("resizeRect", () => {
  const original = rect(0.2, 0.2, 0.4, 0.4);
  const min = { x: 0.01, y: 0.01 };

  it("moves only the dragged corner (south-east)", () => {
    expect(resizeRect(original, "se", { x: 0.8, y: 0.9 }, min)).toEqual(rect(0.2, 0.2, 0.6, 0.7));
  });

  it("moves only the dragged corner (north-west), keeping the opposite corner fixed", () => {
    expect(resizeRect(original, "nw", { x: 0.1, y: 0.05 }, min)).toEqual(rect(0.1, 0.05, 0.5, 0.55));
  });

  it("edge handles change one dimension only", () => {
    expect(resizeRect(original, "e", { x: 0.9, y: 0.99 }, min)).toEqual(rect(0.2, 0.2, 0.7, 0.4));
    expect(resizeRect(original, "n", { x: 0.0, y: 0.1 }, min)).toEqual(rect(0.2, 0.1, 0.4, 0.5));
  });

  it("clamps resizing at the image boundary", () => {
    expect(resizeRect(original, "se", { x: 1.5, y: 1.5 }, min)).toEqual(rect(0.2, 0.2, 0.8, 0.8));
    expect(resizeRect(original, "nw", { x: -1, y: -1 }, min)).toEqual(rect(0, 0, 0.6, 0.6));
  });

  it("does not let an edge cross the opposite edge; keeps the minimum size", () => {
    expect(resizeRect(original, "e", { x: 0.0, y: 0.3 }, min)).toEqual(rect(0.2, 0.2, 0.01, 0.4));
    expect(resizeRect(original, "s", { x: 0.3, y: 0.1 }, min)).toEqual(rect(0.2, 0.2, 0.4, 0.01));
  });
});

describe("hit testing", () => {
  const tol = { x: 0.01, y: 0.02 };
  const items = [
    { id: "big", shape: rect(0.1, 0.1, 0.8, 0.8) },
    { id: "small", shape: rect(0.4, 0.4, 0.1, 0.1) },
    { id: "pt", shape: { kind: "point" as const, x: 0.45, y: 0.45 } },
  ];

  it("prefers points over rectangles underneath them", () => {
    expect(hitTest(items, { x: 0.452, y: 0.455 }, tol)).toBe("pt");
  });

  it("picks the top-most (last drawn) rectangle", () => {
    expect(hitTest(items, { x: 0.42, y: 0.42 }, tol)).toBe("small");
    expect(hitTest(items, { x: 0.2, y: 0.2 }, tol)).toBe("big");
  });

  it("includes a tolerance margin outside rectangle edges", () => {
    expect(hitTest([items[0]!], { x: 0.095, y: 0.5 }, tol)).toBe("big");
    expect(hitTest([items[0]!], { x: 0.08, y: 0.5 }, tol)).toBeUndefined();
  });

  it("uses per-axis tolerance for points", () => {
    const pt = [{ id: "p", shape: { kind: "point" as const, x: 0.5, y: 0.5 } }];
    expect(hitTest(pt, { x: 0.5, y: 0.519 }, tol)).toBe("p");
    expect(hitTest(pt, { x: 0.519, y: 0.5 }, tol)).toBeUndefined();
  });

  it("returns undefined over empty image areas", () => {
    expect(hitTest(items, { x: 0.95, y: 0.95 }, tol)).toBeUndefined();
  });

  it("finds the nearest resize handle within tolerance", () => {
    const r = rect(0.2, 0.2, 0.4, 0.4);
    expect(handlePositions(r).se).toEqual({ x: 0.6000000000000001, y: 0.6000000000000001 });
    expect(hitHandle(r, { x: 0.605, y: 0.61 }, tol)).toBe("se");
    expect(hitHandle(r, { x: 0.4, y: 0.205 }, tol)).toBe("n");
    expect(hitHandle(r, { x: 0.4, y: 0.4 }, tol)).toBeUndefined();
  });
});

describe("isValidShape", () => {
  it("accepts shapes inside the image", () => {
    expect(isValidShape(rect(0, 0, 1, 1))).toBe(true);
    expect(isValidShape({ kind: "point", x: 1, y: 0 })).toBe(true);
  });

  it("rejects malformed or out-of-bounds shapes", () => {
    expect(isValidShape(rect(0.5, 0.5, 0.6, 0.1))).toBe(false); // extends past the right edge
    expect(isValidShape(rect(-0.1, 0, 0.5, 0.5))).toBe(false);
    expect(isValidShape(rect(0.1, 0.1, 0, 0.5))).toBe(false);
    expect(isValidShape({ kind: "rect", x: 0.1, y: 0.1, width: Number.NaN, height: 0.2 })).toBe(false);
    expect(isValidShape({ kind: "point", x: 1.2, y: 0.5 })).toBe(false);
    expect(isValidShape({ kind: "circle", x: 0.5, y: 0.5 })).toBe(false);
    expect(isValidShape({ kind: "point", x: "0.5", y: 0.5 })).toBe(false);
    expect(isValidShape({ kind: "point", x: 0.5, y: 0.5, screenX: 300 })).toBe(false);
    expect(isValidShape(null)).toBe(false);
  });

  it("compares shapes by value", () => {
    expect(shapesEqual(rect(0.1, 0.1, 0.2, 0.2), rect(0.1, 0.1, 0.2, 0.2))).toBe(true);
    expect(shapesEqual(rect(0.1, 0.1, 0.2, 0.2), rect(0.1, 0.1, 0.2, 0.3))).toBe(false);
    expect(shapesEqual({ kind: "point", x: 0.1, y: 0.1 }, rect(0.1, 0.1, 0.2, 0.2))).toBe(false);
  });
});
