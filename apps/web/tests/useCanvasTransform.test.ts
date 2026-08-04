import { describe, expect, it } from "vitest";

import { calculateCanvasFitTransform } from "../src/app/hooks/useCanvasTransform";

describe("calculateCanvasFitTransform", () => {
  it("keeps small swarms readable instead of over-zooming out", () => {
    const transform = calculateCanvasFitTransform(
      [
        { x: -40, y: -20, radius: 40 },
        { x: 45, y: 30, radius: 12 },
      ],
      { width: 1100, height: 900 },
    );

    expect(transform).not.toBeNull();
    expect(transform?.scale).toBeGreaterThanOrEqual(1.2);
    expect(transform?.scale).toBeLessThanOrEqual(1.85);
  });

  it("lets compact graphs use the canvas as a fuller stage", () => {
    const transform = calculateCanvasFitTransform(
      [
        { x: 0, y: 0, radius: 52 },
        { x: 80, y: 45, radius: 40 },
        { x: -90, y: 50, radius: 40 },
      ],
      { width: 1200, height: 1400 },
    );

    expect(transform).not.toBeNull();
    expect(transform?.scale).toBeGreaterThan(1.4);
    expect(transform?.scale).toBeLessThanOrEqual(1.85);
  });

  it("accounts for node radius while fitting bounds", () => {
    const transform = calculateCanvasFitTransform(
      [
        { x: -500, y: 0, radius: 80 },
        { x: 500, y: 0, radius: 80 },
      ],
      { width: 600, height: 400 },
    );

    expect(transform).not.toBeNull();
    expect(transform?.scale).toBeLessThan(0.5);
    expect(transform?.translateX).toBeCloseTo(300, 0);
  });

  it("returns null for empty or unmeasured canvases", () => {
    expect(calculateCanvasFitTransform([], { width: 600, height: 400 })).toBeNull();
    expect(calculateCanvasFitTransform([{ x: 0, y: 0 }], { width: 0, height: 400 })).toBeNull();
  });
});
