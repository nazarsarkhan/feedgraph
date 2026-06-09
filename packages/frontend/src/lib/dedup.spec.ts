import {
  dedupResultMessage,
  isDedupJobSettled,
  type DedupJobState,
  type DeduplicateResult,
} from './entities';

describe('isDedupJobSettled', () => {
  const settled: DedupJobState[] = ['completed', 'failed', 'unknown'];
  const pending: DedupJobState[] = [
    'waiting',
    'active',
    'delayed',
    'paused',
    'waiting-children',
    'prioritized',
  ];

  for (const state of settled) {
    it(`treats "${state}" as settled (stop polling)`, () => {
      expect(isDedupJobSettled(state)).toBe(true);
    });
  }

  for (const state of pending) {
    it(`treats "${state}" as not settled (keep polling)`, () => {
      expect(isDedupJobSettled(state)).toBe(false);
    });
  }
});

describe('dedupResultMessage', () => {
  function result(over: Partial<DeduplicateResult> = {}): DeduplicateResult {
    return { entitiesConsidered: 10, groupsFound: 0, entitiesMerged: 0, batches: 1, ...over };
  }

  it('reports the analysed count when nothing was merged', () => {
    expect(dedupResultMessage(result({ entitiesConsidered: 42 }))).toBe(
      'No duplicates found (analysed 42 entities).',
    );
  });

  it('singularises a single merged entity and single group', () => {
    expect(dedupResultMessage(result({ groupsFound: 1, entitiesMerged: 1 }))).toBe(
      'Merged 1 duplicate entity into 1 group.',
    );
  });

  it('pluralises multiple merged entities and groups', () => {
    expect(dedupResultMessage(result({ groupsFound: 3, entitiesMerged: 7 }))).toBe(
      'Merged 7 duplicate entities into 3 groups.',
    );
  });
});
