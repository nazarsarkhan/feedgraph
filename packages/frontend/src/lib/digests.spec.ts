import { isDigestJobSettled, type DigestJobState } from './digests';

describe('isDigestJobSettled', () => {
  const settled: DigestJobState[] = ['completed', 'failed', 'unknown'];
  const pending: DigestJobState[] = [
    'waiting',
    'active',
    'delayed',
    'paused',
    'waiting-children',
    'prioritized',
  ];

  for (const state of settled) {
    it(`treats "${state}" as settled (stop polling)`, () => {
      expect(isDigestJobSettled(state)).toBe(true);
    });
  }

  for (const state of pending) {
    it(`treats "${state}" as not settled (keep polling)`, () => {
      expect(isDigestJobSettled(state)).toBe(false);
    });
  }
});
