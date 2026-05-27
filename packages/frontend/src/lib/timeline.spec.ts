import { fillTimelineGaps } from './timeline';

describe('fillTimelineGaps', () => {
  it('returns empty array for empty input', () => {
    expect(fillTimelineGaps([])).toEqual([]);
  });

  it('returns single point unchanged', () => {
    const input = [{ date: '2026-05-01', count: 3 }];
    expect(fillTimelineGaps(input)).toEqual([{ date: '2026-05-01', count: 3 }]);
  });

  it('fills gaps between two non-adjacent dates', () => {
    const input = [
      { date: '2026-05-01', count: 3 },
      { date: '2026-05-04', count: 1 },
    ];
    expect(fillTimelineGaps(input)).toEqual([
      { date: '2026-05-01', count: 3 },
      { date: '2026-05-02', count: 0 },
      { date: '2026-05-03', count: 0 },
      { date: '2026-05-04', count: 1 },
    ]);
  });

  it('sorts unsorted input before filling', () => {
    const input = [
      { date: '2026-05-04', count: 1 },
      { date: '2026-05-01', count: 3 },
    ];
    const result = fillTimelineGaps(input);
    expect(result[0].date).toBe('2026-05-01');
    expect(result[result.length - 1].date).toBe('2026-05-04');
    expect(result).toHaveLength(4);
  });

  it('does not mutate the input array', () => {
    const input = [
      { date: '2026-05-04', count: 1 },
      { date: '2026-05-01', count: 3 },
    ];
    const original = JSON.parse(JSON.stringify(input)) as typeof input;
    fillTimelineGaps(input);
    expect(input).toEqual(original);
  });

  it('handles adjacent dates with no gaps', () => {
    const input = [
      { date: '2026-05-01', count: 1 },
      { date: '2026-05-02', count: 2 },
      { date: '2026-05-03', count: 3 },
    ];
    expect(fillTimelineGaps(input)).toEqual(input);
  });

  it('handles DST boundary (Europe spring-forward) without skipping a day', () => {
    // Without UTC arithmetic, local-time advancement on a TZ that springs
    // forward would skip the boundary day. fillTimelineGaps uses UTC; this
    // test asserts the missing 2026-03-29 row is inserted with count=0.
    const input = [
      { date: '2026-03-28', count: 1 },
      { date: '2026-03-30', count: 1 },
    ];
    const result = fillTimelineGaps(input);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ date: '2026-03-29', count: 0 });
  });

  it('fills a 14-day span from 5 sparse points', () => {
    const input = [
      { date: '2026-05-10', count: 2 },
      { date: '2026-05-13', count: 1 },
      { date: '2026-05-17', count: 4 },
      { date: '2026-05-21', count: 1 },
      { date: '2026-05-23', count: 3 },
    ];
    const result = fillTimelineGaps(input);
    expect(result).toHaveLength(14);
    expect(result.filter((p) => p.count === 0)).toHaveLength(9);
  });
});
