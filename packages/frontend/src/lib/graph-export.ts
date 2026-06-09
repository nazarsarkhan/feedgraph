// Pure sizing math for the full-graph image export. Kept separate from
// GraphPage so it's unit-testable without a DOM / react-flow instance.
//
// The export renders the WHOLE graph (not just the visible viewport) by
// computing a target image size from the nodes' bounding box and a
// react-flow viewport transform that fits those bounds into that size.
// This module owns the "how big should the image be" half.

// Single-canvas hard limits across browser engines: a per-side cap
// (~16384px on Chrome/Safari/Firefox) and a total-area cap (~268M px on
// Chrome before it silently returns a blank canvas). We size the export
// so that neither is breached even after multiplying by pixelRatio.
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 268_000_000;

// Default longest-side target. 4096 is sharp at presentation sizes and,
// at pixelRatio 2 (8192px/side, ≤67M px), stays comfortably under both
// canvas limits regardless of aspect ratio.
export const DEFAULT_MAX_SIDE = 4096;
export const DEFAULT_PIXEL_RATIO = 2;

export interface ExportSize {
  imageWidth: number;
  imageHeight: number;
  pixelRatio: number;
}

/**
 * Compute the output image dimensions + pixelRatio for a graph whose
 * node bounding box is `bounds`.
 *
 * - Scales the longest side to `maxSide`, preserving aspect ratio, so
 *   the whole graph fills the image with no distortion or letterboxing.
 * - Backs `pixelRatio` off to 1 if the base ratio would push the canvas
 *   past a per-side or total-area browser limit (only reachable with an
 *   atypically large `maxSide`; at the 4096 default it never triggers).
 */
export function computeExportSize(
  bounds: { width: number; height: number },
  options: { maxSide?: number; pixelRatio?: number } = {},
): ExportSize {
  const maxSide = options.maxSide ?? DEFAULT_MAX_SIDE;
  const basePixelRatio = options.pixelRatio ?? DEFAULT_PIXEL_RATIO;

  // Degenerate bounds (a single node, or zero-area) must never produce a
  // 0px canvas or a divide-by-zero — floor each side at 1px.
  const bw = Math.max(bounds.width, 1);
  const bh = Math.max(bounds.height, 1);

  const scale = maxSide / Math.max(bw, bh);
  const imageWidth = Math.max(1, Math.round(bw * scale));
  const imageHeight = Math.max(1, Math.round(bh * scale));

  let pixelRatio = basePixelRatio;
  const exceedsSide =
    imageWidth * pixelRatio > MAX_CANVAS_SIDE || imageHeight * pixelRatio > MAX_CANVAS_SIDE;
  const exceedsArea = imageWidth * imageHeight * pixelRatio * pixelRatio > MAX_CANVAS_AREA;
  if (exceedsSide || exceedsArea) {
    pixelRatio = 1;
  }

  return { imageWidth, imageHeight, pixelRatio };
}
