import {
  computeExportSize,
  DEFAULT_MAX_SIDE,
  MAX_CANVAS_SIDE,
  MAX_CANVAS_AREA,
} from './graph-export';

describe('computeExportSize', () => {
  it('scales the longest side to maxSide and preserves aspect ratio (landscape)', () => {
    const { imageWidth, imageHeight, pixelRatio } = computeExportSize({
      width: 3000,
      height: 2000,
    });
    expect(imageWidth).toBe(DEFAULT_MAX_SIDE); // longest side hits the cap
    expect(imageHeight).toBe(Math.round(DEFAULT_MAX_SIDE * (2000 / 3000)));
    expect(imageWidth / imageHeight).toBeCloseTo(3000 / 2000, 2);
    expect(pixelRatio).toBe(2);
  });

  it('caps the height when the graph is portrait', () => {
    const { imageWidth, imageHeight } = computeExportSize({ width: 1000, height: 5000 });
    expect(imageHeight).toBe(DEFAULT_MAX_SIDE); // tall graph → height is the longest side
    expect(imageWidth).toBe(Math.round(DEFAULT_MAX_SIDE * (1000 / 5000)));
  });

  it('upscales a small graph to the target so it stays sharp', () => {
    const { imageWidth, imageHeight } = computeExportSize({ width: 500, height: 300 });
    expect(Math.max(imageWidth, imageHeight)).toBe(DEFAULT_MAX_SIDE);
  });

  it('never exceeds the per-side or total-area canvas limit after pixelRatio', () => {
    const { imageWidth, imageHeight, pixelRatio } = computeExportSize({
      width: 3000,
      height: 2000,
    });
    expect(imageWidth * pixelRatio).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(imageHeight * pixelRatio).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(imageWidth * imageHeight * pixelRatio * pixelRatio).toBeLessThanOrEqual(MAX_CANVAS_AREA);
  });

  it('drops pixelRatio to 1 when 2x would breach the per-side limit', () => {
    // maxSide 12000 at 2x = 24000px > 16384 → must back off to 1x.
    const { pixelRatio, imageWidth } = computeExportSize(
      { width: 12000, height: 12000 },
      { maxSide: 12000 },
    );
    expect(imageWidth).toBe(12000);
    expect(pixelRatio).toBe(1);
  });

  it('drops pixelRatio to 1 when 2x would breach the total-area limit (per-side still ok)', () => {
    // 8000x8000 @ 2x: sides 16000 ≤ 16384, area 64M*4 = 256M ≤ 268M → stays 2x.
    expect(computeExportSize({ width: 8000, height: 8000 }, { maxSide: 8000 }).pixelRatio).toBe(2);
    // 8192x8192 @ 2x: sides exactly 16384 (not over), but area 67.1M*4 = 268.4M > 268M
    // → area is the sole trigger that backs it off.
    expect(computeExportSize({ width: 8192, height: 8192 }, { maxSide: 8192 }).pixelRatio).toBe(1);
  });

  it('handles degenerate zero-area bounds without producing a 0px canvas', () => {
    const { imageWidth, imageHeight, pixelRatio } = computeExportSize({ width: 0, height: 0 });
    expect(imageWidth).toBeGreaterThanOrEqual(1);
    expect(imageHeight).toBeGreaterThanOrEqual(1);
    expect(pixelRatio).toBe(2);
  });
});
