import { describe, expect, it } from "vitest";

import { makeEngine, makeState, slot, TOY_RING } from "./helpers.js";

import {
  createRingParameters,
  PolynomialState,
} from "../../src/core/polynomial/index.js";
import {
  aggregatePolynomial,
  PermutationAction,
  samePolynomialMultiset,
} from "../../src/core/transform/index.js";
import { createPermutation } from "../../src/core/geometry/index.js";

describe("Layer 3: permutation action on polynomial states", () => {
  it("moves whole polynomial payloads according to source-to-destination convention", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const action = new PermutationAction(
      engine,
      TOY_RING,
      createPermutation([1, 0, 2, 3, 4, 5]),
    );
    const result = action.apply(state);
    expect(result.get(slot(0)).equals(state.get(slot(1)))).toBe(true);
    expect(result.get(slot(1)).equals(state.get(slot(0)))).toBe(true);
    expect(result.get(slot(2)).equals(state.get(slot(2)))).toBe(true);
  });

  it("inverse action restores the exact original state", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const action = new PermutationAction(
      engine,
      TOY_RING,
      createPermutation([1, 0, 2, 3, 4, 5]),
    );
    expect(action.inverse().apply(action.apply(state)).equals(state)).toBe(
      true,
    );
  });

  it("preserves polynomial multiset and aggregate polynomial", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const action = new PermutationAction(
      engine,
      TOY_RING,
      createPermutation([1, 0, 2, 3, 4, 5]),
    );
    const result = action.apply(state);
    expect(samePolynomialMultiset(state, result)).toBe(true);
    expect(aggregatePolynomial(state).equals(aggregatePolynomial(result))).toBe(
      true,
    );
  });

  it("rejects a permutation that does not cover the global slot space", () => {
    const engine = makeEngine([1]);
    expect(
      () => new PermutationAction(engine, TOY_RING, createPermutation([1, 0])),
    ).toThrow(/global slots/);
  });

  it("rejects a state from a different ordered geometry specification", () => {
    const action = new PermutationAction(
      makeEngine([1]),
      TOY_RING,
      createPermutation([0, 1, 2, 3, 4, 5]),
    );
    expect(() => action.apply(makeState(makeEngine([2])))).toThrow(
      /different ordered geometry/,
    );
  });

  it("rejects a state using a different polynomial ring", () => {
    const engine = makeEngine([1]);
    const action = new PermutationAction(
      engine,
      TOY_RING,
      createPermutation([0, 1, 2, 3, 4, 5]),
    );
    const otherRing = createRingParameters(19n, 4);
    expect(() => action.apply(PolynomialState.zero(engine, otherRing))).toThrow(
      /incompatible polynomial ring/,
    );
  });

  it("copies the validated permutation mapping into its own immutable instance", () => {
    const engine = makeEngine([1]);
    const action = new PermutationAction(
      engine,
      TOY_RING,
      createPermutation([1, 0, 2, 3, 4, 5]),
    );
    expect(Object.isFrozen(action)).toBe(true);
    expect(Object.isFrozen(action.permutation.sourceToDestination)).toBe(true);
    expect(action.permutation.sourceToDestination.map(Number)).toEqual([
      1, 0, 2, 3, 4, 5,
    ]);
  });
});
