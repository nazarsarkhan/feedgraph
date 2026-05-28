import type { GraphEdge, GraphNode } from './graph';

/**
 * Pure functions for the Graph page's timeline mode. No React, no
 * side effects — `filterGraphAtTime` and `computeTimelineRange` are
 * deterministic functions of their inputs so the filtering layer is
 * easy to reason about (and easy to unit-test if/when the suite grows
 * to cover it).
 *
 * All timestamps are Unix **seconds** to match the backend
 * (`EXTRACT(EPOCH FROM ...)::int`). Entity nodes carry ISO strings
 * (`firstSeen`) which we parse once into the per-call timestamps Map.
 */

export interface TimelineRange {
  /** Earliest visible timestamp (Unix seconds). */
  min: number;
  /** Latest visible timestamp (Unix seconds). */
  max: number;
}

/**
 * Compute the timeline range from the raw graph response. Spans both
 * entity firstSeen and article publishedAt; returns null when no node
 * carries a usable timestamp (the timeline UI hides itself in that
 * case). Single-point datasets (min === max) are returned as-is —
 * the slider component handles a zero-width range gracefully.
 */
export function computeTimelineRange(nodes: GraphNode[]): TimelineRange | null {
  const timestamps: number[] = [];

  for (const n of nodes) {
    if (n.kind === 'entity') {
      const t = isoToUnixSeconds(n.firstSeen);
      if (t != null) timestamps.push(t);
    } else if (n.kind === 'article') {
      const t = isoToUnixSeconds(n.publishedAt);
      if (t != null) timestamps.push(t);
    }
  }

  if (timestamps.length === 0) return null;
  return {
    min: Math.min(...timestamps),
    max: Math.max(...timestamps),
  };
}

/**
 * Filter nodes + edges to "the graph state at time T". Pure function
 * — no React, no mutation of inputs.
 *
 *   - Entity nodes: kept when `firstSeen <= T`. Nodes with missing
 *     firstSeen are always kept (defensive — better to show too much
 *     than too little when timestamps are absent).
 *   - Article nodes: kept when `publishedAt <= T`. Same null tolerance.
 *   - Edges: kept when (a) BOTH endpoints survive the node filter
 *     AND (b) `minPublishedAt <= T`. Edges with a null
 *     `minPublishedAt` (RSS feed without pubDate) are kept whenever
 *     their endpoints survive — same don't-hide-on-missing-data rule.
 */
export function filterGraphAtTime(
  nodes: GraphNode[],
  edges: GraphEdge[],
  tUnix: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const survivingIds = new Set<string>();

  const filteredNodes = nodes.filter((n) => {
    let t: number | null = null;
    if (n.kind === 'entity') t = isoToUnixSeconds(n.firstSeen);
    else if (n.kind === 'article') t = isoToUnixSeconds(n.publishedAt);
    if (t == null || t <= tUnix) {
      survivingIds.add(n.id);
      return true;
    }
    return false;
  });

  const filteredEdges = edges.filter((e) => {
    if (!survivingIds.has(e.source) || !survivingIds.has(e.target)) return false;
    if (e.minPublishedAt == null) return true;
    return e.minPublishedAt <= tUnix;
  });

  return { nodes: filteredNodes, edges: filteredEdges };
}

/**
 * Format a Unix-seconds timestamp for the slider track label.
 * UTC-anchored so the displayed calendar date doesn't shift with the
 * user's local DST.
 */
export function formatSliderDate(tUnix: number): string {
  return new Date(tUnix * 1000).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isoToUnixSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}
