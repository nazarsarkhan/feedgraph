export interface TimelinePoint {
  date: string;
  count: number;
}

/**
 * Fill every calendar day in [min(date)..max(date)] with count=0 if absent.
 * Backend returns sparse data (only days with mentions); the chart needs
 * explicit zeros so we don't draw an interpolated line across long gaps.
 * Pure: returns a new array, sorted ascending; does not mutate input.
 */
export function fillTimelineGaps(points: TimelinePoint[]): TimelinePoint[] {
  if (points.length === 0) return [];

  const byDate = new Map(points.map((p) => [p.date, p.count]));
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const start = new Date(`${sorted[0].date}T00:00:00Z`);
  const end = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`);

  const result: TimelinePoint[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, count: byDate.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
