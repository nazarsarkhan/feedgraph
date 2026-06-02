import { formatAbsolute, getUserTimeZone } from './timezone';

describe('getUserTimeZone', () => {
  it('returns a non-empty IANA-ish string', () => {
    const tz = getUserTimeZone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});

describe('formatAbsolute', () => {
  it('returns undefined for nullish input', () => {
    expect(formatAbsolute(null)).toBeUndefined();
    expect(formatAbsolute(undefined)).toBeUndefined();
    expect(formatAbsolute('')).toBeUndefined();
  });

  it('returns a non-empty formatted string for a valid ISO timestamp', () => {
    const out = formatAbsolute('2026-05-29T14:12:00Z');
    expect(typeof out).toBe('string');
    expect((out ?? '').length).toBeGreaterThan(0);
    // medium dateStyle always spells the year out in full.
    expect(out).toContain('2026');
  });

  it('passes through an unparseable value rather than throwing', () => {
    expect(formatAbsolute('not-a-date')).toBe('not-a-date');
  });
});
