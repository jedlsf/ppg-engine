import { describe, expect, it } from 'vitest';
import {
  applyPermutation,
  composePermutations,
  createPermutation,
  identityPermutation,
  invertPermutation,
  isPermutation,
} from  '../../src/core/geometry/index.js';

describe('Layer 1: slot permutations', () => {
  it('creates identity permutations including the empty permutation', () => {
    expect(identityPermutation(0)).toEqual({ size: 0, sourceToDestination: [] });
    expect(identityPermutation(4).sourceToDestination).toEqual([0, 1, 2, 3]);
  });

  it('validates range, uniqueness, and integer destinations', () => {
    expect(() => createPermutation([0, 0])).toThrowError(/occurs more than once/);
    expect(() => createPermutation([0, 2])).toThrowError(/Invalid destination/);
    expect(() => createPermutation([0, 1.5])).toThrowError(/Invalid destination/);
    expect(() => createPermutation([0, Number.NaN])).toThrowError(/Invalid destination/);
    expect(isPermutation(createPermutation([2, 0, 1]))).toBe(true);
  });

  it('moves each source value to sourceToDestination[source]', () => {
    const permutation = createPermutation([2, 0, 1]);
    expect(applyPermutation(['a', 'b', 'c'], permutation)).toEqual(['b', 'c', 'a']);
  });

  it('composes in documented execution order: first, then second', () => {
    const first = createPermutation([1, 0, 2]); // swap 0 and 1
    const second = createPermutation([0, 2, 1]); // swap 1 and 2
    const composed = composePermutations(first, second);

    expect(composed.sourceToDestination).toEqual([2, 0, 1]);
    expect(applyPermutation(['a', 'b', 'c'], composed)).toEqual(
      applyPermutation(applyPermutation(['a', 'b', 'c'], first), second),
    );
  });

  it('inverts permutations and composing with the inverse gives identity', () => {
    const permutation = createPermutation([2, 0, 3, 1]);
    const inverse = invertPermutation(permutation);
    expect(composePermutations(permutation, inverse).sourceToDestination).toEqual([0, 1, 2, 3]);
    expect(composePermutations(inverse, permutation).sourceToDestination).toEqual([0, 1, 2, 3]);
  });

  it('rejects mismatched permutation/state sizes', () => {
    expect(() => composePermutations(identityPermutation(2), identityPermutation(3))).toThrowError(/different sizes/);
    expect(() => applyPermutation([1, 2], identityPermutation(3))).toThrowError(/State length mismatch/);
  });

  it('does not retain caller-owned mutable mapping arrays', () => {
    const mapping = [1, 0];
    const permutation = createPermutation(mapping);
    mapping[0] = 0;
    expect(permutation.sourceToDestination).toEqual([1, 0]);
    expect(Object.isFrozen(permutation)).toBe(true);
    expect(Object.isFrozen(permutation.sourceToDestination)).toBe(true);
  });
});
