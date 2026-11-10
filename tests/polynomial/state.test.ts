import { describe, expect, it } from 'vitest';

import { PolynomialState,Polynomial, createRingParameters } from "../../src/core/polynomial/index.js";
import { createFaceTurnPermutation, createSystemSpec, FaceId, invertPermutation, makeCubeId, makeSlotId, SlotIndexingEngine } from '../../src/core/geometry/index.js';

const ring = createRingParameters(17n, 4);
const alternateRing = createRingParameters(19n, 4);
const engine = new SlotIndexingEngine(createSystemSpec([
  { id: makeCubeId(10), gridSize: 2 },
  { id: makeCubeId(42), gridSize: 3 },
]));
const polynomialFor = (seed: bigint) => Polynomial.fromCoefficients(ring, [seed, seed + 1n, seed + 2n]);

describe('Layer 2: polynomial state over Layer 1 SlotIds', () => {
  it('creates a zero polynomial for every canonical slot', () => {
    const state = PolynomialState.zero(engine, ring);
    expect(state.values).toHaveLength(engine.spec.totalSlots);
    expect(state.values.every((value) => value.isZero())).toBe(true);
    expect(Object.isFrozen(state.values)).toBe(true);
  });

  it('initializes deterministically using global SlotId and coordinate', () => {
    const state = PolynomialState.fromInitializer(engine, ring, (slotId, coordinate) =>
      polynomialFor(BigInt(Number(slotId) + Number(coordinate.faceId))),
    );
    for (const entry of engine.entries()) {
      const expected = polynomialFor(BigInt(Number(entry.slotId) + Number(entry.coordinate.faceId)));
      expect(state.get(entry.slotId).equals(expected)).toBe(true);
    }
  });

  it('maps valid values to their canonical SlotId positions', () => {
    const values = Array.from({ length: engine.spec.totalSlots }, (_, index) => polynomialFor(BigInt(index)));
    const state = PolynomialState.fromValues(engine, ring, values);
    expect(state.get(makeSlotId(0)).equals(values[0]!)).toBe(true);
    expect(state.get(makeSlotId(engine.spec.totalSlots - 1)).equals(values.at(-1)!)).toBe(true);
  });

  it('returns a new immutable state when changing one slot', () => {
    const original = PolynomialState.zero(engine, ring);
    const slot = makeSlotId(3);
    const value = polynomialFor(7n);
    const updated = original.withValue(slot, value);
    expect(updated).not.toBe(original);
    expect(updated.get(slot).equals(value)).toBe(true);
    expect(original.get(slot).isZero()).toBe(true);
    expect(updated.values).not.toBe(original.values);
  });

  it('permutes polynomial payloads using Layer 1 face-turn permutations', () => {
    const values = Array.from({ length: engine.spec.totalSlots }, (_, index) =>
      Polynomial.fromCoefficients(ring, [BigInt(index % 17), BigInt(Math.floor(index / 17))]),
    );
    const state = PolynomialState.fromValues(engine, ring, values);
    const permutation = createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(42),
      faceId: FaceId.FRONT,
      quarterTurns: 1,
    });
    const permuted = state.permute(permutation);
    expect(permuted).not.toBe(state);
    expect(permuted.values).not.toEqual(state.values);
    expect(permuted.permute(invertPermutation(permutation)).equals(state)).toBe(true);
  });

  it('restores the original state after applying a move and its inverse', () => {
    const state = PolynomialState.fromInitializer(engine, ring, (slotId) => polynomialFor(BigInt(Number(slotId))));
    const forward = createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(10),
      faceId: FaceId.UP,
      quarterTurns: 1,
    });
    const reverse = createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(10),
      faceId: FaceId.UP,
      quarterTurns: -1,
    });
    expect(state.permute(forward).permute(reverse).equals(state)).toBe(true);
  });

  it('maps every value while preserving ring and slot layout', () => {
    const state = PolynomialState.fromInitializer(engine, ring, () => Polynomial.one(ring));
    const doubled = state.mapValues((_slot, _coordinate, current) => current.scale(2n));
    expect(doubled.values.every((value) => value.equals(Polynomial.one(ring).scale(2n)))).toBe(true);
    expect(doubled.values).toHaveLength(state.values.length);
  });

  it('compares states by ring, system spec, and polynomial values', () => {
    const zeroA = PolynomialState.zero(engine, ring);
    const sameEngineShape = new SlotIndexingEngine(createSystemSpec([
      { id: makeCubeId(10), gridSize: 2 },
      { id: makeCubeId(42), gridSize: 3 },
    ]));
    const zeroB = PolynomialState.zero(sameEngineShape, ring);
    const otherRing = PolynomialState.zero(engine, alternateRing);
    expect(zeroA.equals(zeroB)).toBe(true);
    expect(zeroA.equals(otherRing)).toBe(false);
    expect(zeroA.equals(zeroA.withValue(makeSlotId(0), Polynomial.one(ring)))).toBe(false);
  });

  it('rejects wrong state length, invalid values, and mismatched rings', () => {
    expect(() => PolynomialState.fromValues(engine, ring, [])).toThrow(/Expected/);
    const sparse = new Array<Polynomial>(engine.spec.totalSlots);
    expect(() => PolynomialState.fromValues(engine, ring, sparse)).toThrow(/not a Polynomial/);
    expect(() => PolynomialState.fromValues(engine, ring, Array.from(
      { length: engine.spec.totalSlots }, () => Polynomial.one(alternateRing),
    ))).toThrow(/incompatible ring/);
    expect(() => PolynomialState.fromValues(engine, ring, Array.from(
      { length: engine.spec.totalSlots }, (_, index) => index === 0 ? ({} as Polynomial) : Polynomial.zero(ring),
    ))).toThrow(/not a Polynomial/);
    expect(() => PolynomialState.zero(engine, ring).withValue(makeSlotId(0), Polynomial.one(alternateRing))).toThrow(/do not match/);
  });

  it('rejects invalid slot IDs and invalid initializer/mapper results', () => {
    const state = PolynomialState.zero(engine, ring);
    expect(() => state.get(makeSlotId(engine.spec.totalSlots))).toThrow(/Invalid SlotId/);
    expect(() => state.get(-1 as never)).toThrow(/Invalid SlotId/);
    expect(() => PolynomialState.fromInitializer(engine, ring, (() => ({})) as never)).toThrow(/non-Polynomial/);
    expect(() => state.mapValues(() => Polynomial.one(alternateRing))).toThrow(/incompatible polynomial/);
  });

  it('supports an empty system as an empty state', () => {
    const emptyEngine = new SlotIndexingEngine(createSystemSpec([]));
    const state = PolynomialState.zero(emptyEngine, ring);
    expect(state.values).toEqual([]);
    expect(state.equals(PolynomialState.fromValues(emptyEngine, ring, []))).toBe(true);
  });
});
