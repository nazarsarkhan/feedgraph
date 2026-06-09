import type { MatchEntitiesGroup } from '@feedgraph/shared';
import { chunkEntities, planMergeGroups } from './entity-dedup.service';

// We test the two pure helpers that carry the dedup correctness logic:
// batching (chunkEntities) and validate-then-claim (planMergeGroups). The
// service's DB/queue side effects need a Nest container; the pure predicates
// are where the bugs live.

function group(over: Partial<MatchEntitiesGroup> = {}): MatchEntitiesGroup {
  return {
    canonicalId: 'a',
    duplicateIds: ['b'],
    aliases: ['Alpha', 'Beta'],
    confidence: 0.95,
    ...over,
  };
}

describe('chunkEntities', () => {
  it('splits into fixed-size batches with a smaller final batch', () => {
    const rows = [1, 2, 3, 4, 5];
    expect(chunkEntities(rows, 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single batch when size exceeds length', () => {
    expect(chunkEntities([1, 2, 3], 200)).toEqual([[1, 2, 3]]);
  });

  it('returns an empty array for no rows', () => {
    expect(chunkEntities([], 200)).toEqual([]);
  });

  it('splits evenly when length is a multiple of size', () => {
    expect(chunkEntities([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('throws on a non-positive size', () => {
    expect(() => chunkEntities([1], 0)).toThrow('chunk size must be positive');
    expect(() => chunkEntities([1], -1)).toThrow('chunk size must be positive');
  });
});

describe('planMergeGroups', () => {
  const validIds = new Set(['a', 'b', 'c', 'd']);
  const minConfidence = 0.8;

  it('keeps a clean, confident group', () => {
    const result = planMergeGroups(validIds, [group()], minConfidence);
    expect(result).toEqual([{ canonicalId: 'a', duplicateIds: ['b'], aliases: ['Alpha', 'Beta'] }]);
  });

  it('drops groups below the confidence floor', () => {
    expect(planMergeGroups(validIds, [group({ confidence: 0.79 })], minConfidence)).toEqual([]);
  });

  it('keeps a group exactly at the confidence floor', () => {
    expect(planMergeGroups(validIds, [group({ confidence: 0.8 })], minConfidence)).toHaveLength(1);
  });

  it('drops a group with an empty duplicate list', () => {
    expect(planMergeGroups(validIds, [group({ duplicateIds: [] })], minConfidence)).toEqual([]);
  });

  it('drops a group whose canonicalId is not in the batch set', () => {
    expect(
      planMergeGroups(
        validIds,
        [group({ canonicalId: 'zzz', duplicateIds: ['b'] })],
        minConfidence,
      ),
    ).toEqual([]);
  });

  it('drops a group containing a duplicate id from outside the batch (hallucination / other tenant)', () => {
    expect(
      planMergeGroups(
        validIds,
        [group({ canonicalId: 'a', duplicateIds: ['b', 'other'] })],
        minConfidence,
      ),
    ).toEqual([]);
  });

  it('drops a self-merge (canonicalId also in duplicateIds)', () => {
    expect(
      planMergeGroups(
        validIds,
        [group({ canonicalId: 'a', duplicateIds: ['a', 'b'] })],
        minConfidence,
      ),
    ).toEqual([]);
  });

  it('claims ids so a single id is never touched by two groups', () => {
    // Group 1 claims a + b. Group 2 reuses b as its canonical → dropped.
    const groups = [
      group({ canonicalId: 'a', duplicateIds: ['b'] }),
      group({ canonicalId: 'b', duplicateIds: ['c'] }),
    ];
    const result = planMergeGroups(validIds, groups, minConfidence);
    expect(result).toEqual([{ canonicalId: 'a', duplicateIds: ['b'], aliases: ['Alpha', 'Beta'] }]);
  });

  it('drops a later group whose duplicate was already claimed', () => {
    const groups = [
      group({ canonicalId: 'a', duplicateIds: ['b'] }),
      group({ canonicalId: 'c', duplicateIds: ['b'] }),
    ];
    const result = planMergeGroups(validIds, groups, minConfidence);
    expect(result).toHaveLength(1);
    expect(result[0].canonicalId).toBe('a');
  });

  it('keeps two non-overlapping groups', () => {
    const groups = [
      group({ canonicalId: 'a', duplicateIds: ['b'] }),
      group({ canonicalId: 'c', duplicateIds: ['d'] }),
    ];
    expect(planMergeGroups(validIds, groups, minConfidence)).toHaveLength(2);
  });
});
