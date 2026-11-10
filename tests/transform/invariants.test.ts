import { describe, expect, it } from 'vitest';


import { makeEngine, makePolynomial, makeState, slot, TOY_RING } from './helpers.js';
import { createRingParameters, PolynomialState } from '../../src/core/polynomial/index.js';
import { aggregatePolynomial, compareStates, PermutationAction, PolynomialCoupling, polynomialMultiset, RingAutomorphism, samePolynomialMultiset } from '../../src/core/transform/index.js';
import { createPermutation } from '../../src/core/geometry/index.js';

describe('Layer 3: state observations and invariants', () => {
  it('computes a sorted multiset with multiplicities', () => {
    const engine = makeEngine([1]);
    const zero = PolynomialState.zero(engine, TOY_RING);
    const multiset = polynomialMultiset(zero);
    expect(multiset).toHaveLength(1);
    expect(multiset[0]?.count).toBe(engine.spec.totalSlots);
  });

  it('identifies polynomial multisets as equal independent of slot order', () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const swapped = new PermutationAction(engine, TOY_RING, createPermutation([1, 0, 2, 3, 4, 5])).apply(state);
    expect(samePolynomialMultiset(state, swapped)).toBe(true);
  });

  it('detects when a coupling changes the polynomial multiset', () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const changed = new PolynomialCoupling(engine, TOY_RING, slot(0), slot(1), makePolynomial(3n)).apply(state);
    expect(samePolynomialMultiset(state, changed)).toBe(false);
  });

  it('aggregates polynomial values coefficient-wise across slots', () => {
    const engine = makeEngine([1]);
    const state = PolynomialState.zero(engine, TOY_RING)
      .withValue(slot(0), makePolynomial(2n, 3n))
      .withValue(slot(1), makePolynomial(5n, 1n));
    expect(aggregatePolynomial(state).equals(makePolynomial(7n, 4n))).toBe(true);
  });

  it('uses zero aggregate for an empty geometry state', () => {
    const engine = makeEngine([]);
    const state = PolynomialState.zero(engine, TOY_RING);
    expect(aggregatePolynomial(state).isZero()).toBe(true);
  });

  it('reports invariants preserved by slot permutation', () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const result = new PermutationAction(engine, TOY_RING, createPermutation([1, 0, 2, 3, 4, 5])).apply(state);
    expect(compareStates(state, result)).toEqual({
      sameSystem: true,
      sameRing: true,
      sameSlotCount: true,
      samePolynomialMultiset: true,
      sameAggregatePolynomial: true,
    });
  });

  it('reports changed aggregate sum for a nontrivial shear', () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const result = new PolynomialCoupling(engine, TOY_RING, slot(0), slot(1), makePolynomial(1n)).apply(state);
    const report = compareStates(state, result);
    expect(report.sameSystem).toBe(true);
    expect(report.sameRing).toBe(true);
    expect(report.sameSlotCount).toBe(true);
    expect(report.sameAggregatePolynomial).toBe(false);
  });

  it('does not incorrectly claim a ring automorphism preserves the multiset', () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const result = new RingAutomorphism(engine, TOY_RING, 3).apply(state);
    const report = compareStates(state, result);
    expect(report.sameSystem).toBe(true);
    expect(report.sameRing).toBe(true);
    // For this fixture, X -> X^3 changes the nonconstant coefficient positions,
    // so the observed polynomial multiset differs. This is a fixture property,
    // not a universal statement about every state.
    expect(report.samePolynomialMultiset).toBe(false);
  });

  it('distinguishes state systems with equal slot counts but different cube configurations', () => {
    const a = makeEngine([2]); // 24 slots in one cube
    const b = makeEngine([1, 1, 1, 1]); // 24 slots in four cubes
    const report = compareStates(makeState(a), makeState(b));
    expect(report.sameSystem).toBe(false);
    expect(report.sameSlotCount).toBe(true);
  });

  it('distinguishes ring parameters', () => {
    const engine = makeEngine([1]);
    const otherRing = createRingParameters(19n, 4);
    const report = compareStates(makeState(engine), PolynomialState.zero(engine, otherRing));
    expect(report.sameRing).toBe(false);
    expect(report.samePolynomialMultiset).toBe(false);
    expect(report.sameAggregatePolynomial).toBe(false);
  });
});
