import { BadRequestException } from '@nestjs/common';
import { computePeriodBounds } from './digests.service';

// computePeriodBounds is the pure date-math core of digest generation: it maps
// any calendar date + period type to the canonical (periodStart, periodEnd)
// bounds that key the (user, period_type, period_start) idempotency. The
// service's DB/queue side effects need a Nest container; this is where the
// off-by-one bugs would live. 2024-01-01 is a known Monday, used as the anchor.

describe('computePeriodBounds', () => {
  describe('day', () => {
    it('maps a day to itself', () => {
      expect(computePeriodBounds('day', '2024-03-10')).toEqual({
        periodStart: '2024-03-10',
        periodEnd: '2024-03-10',
      });
    });
  });

  describe('week (ISO Mon–Sun)', () => {
    it('keeps a Monday as the start', () => {
      expect(computePeriodBounds('week', '2024-01-01')).toEqual({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-07',
      });
    });

    it('maps a mid-week day back to its Monday', () => {
      expect(computePeriodBounds('week', '2024-01-03')).toEqual({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-07',
      });
    });

    it('maps a Sunday back to the preceding Monday (no roll into next week)', () => {
      expect(computePeriodBounds('week', '2024-01-07')).toEqual({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-07',
      });
    });
  });

  describe('month', () => {
    it('spans the full calendar month, leap February included', () => {
      expect(computePeriodBounds('month', '2024-02-15')).toEqual({
        periodStart: '2024-02-01',
        periodEnd: '2024-02-29',
      });
    });

    it('maps the last day of a month to that whole month', () => {
      expect(computePeriodBounds('month', '2024-01-31')).toEqual({
        periodStart: '2024-01-01',
        periodEnd: '2024-01-31',
      });
    });
  });

  it('throws BadRequest on a malformed date', () => {
    expect(() => computePeriodBounds('day', 'not-a-date')).toThrow(BadRequestException);
    expect(() => computePeriodBounds('day', '2024-13-40')).toThrow(BadRequestException);
  });
});
