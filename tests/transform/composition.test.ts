import { describe, expect, it } from "vitest";
import { createPermutation } from "../../src/core/geometry/index.js";
import {
  createRingParameters,
  Polynomial,
} from "../../src/core/polynomial/index.js";
import {
  PolynomialCoupling,
  applyTransformations,
  composeTransformations,
  identityTransformation,
  PermutationAction,
  RingAutomorphism,
} from "../../src/core/transform/index.js";

import {
  makeEngine,
  makePolynomial,
  makeState,
  slot,
  TOY_RING,
} from "./helpers.js";

describe("Layer 3: transformation composition", () => {
  it("executes steps in their documented order", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const first = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      makePolynomial(1n),
    );
    const second = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(1),
      slot(2),
      makePolynomial(1n),
    );
    const sequence = composeTransformations(engine, TOY_RING, [first, second]);
    expect(sequence.apply(state).equals(second.apply(first.apply(state)))).toBe(
      true,
    );
  });

  it("inverse sequence reverses order and inverts every step", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const p = new PermutationAction(
      engine,
      TOY_RING,
      createPermutation([1, 0, 2, 3, 4, 5]),
    );
    const c = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(1),
      slot(3),
      makePolynomial(2n, 1n),
    );
    const a = new RingAutomorphism(engine, TOY_RING, 3);
    const sequence = composeTransformations(engine, TOY_RING, [p, c, a]);
    expect(sequence.inverse().apply(sequence.apply(state)).equals(state)).toBe(
      true,
    );
  });

  it("empty sequence is the identity", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const identity = identityTransformation(engine, TOY_RING);
    expect(identity.apply(state).equals(state)).toBe(true);
    expect(identity.inverse().apply(state).equals(state)).toBe(true);
    expect(identity.steps).toHaveLength(0);
  });

  it("applyTransformations agrees with TransformationSequence", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const transformations = [
      new PolynomialCoupling(
        engine,
        TOY_RING,
        slot(0),
        slot(1),
        makePolynomial(2n),
      ),
      new RingAutomorphism(engine, TOY_RING, 3),
    ];
    expect(
      applyTransformations(state, transformations).equals(
        composeTransformations(engine, TOY_RING, transformations).apply(state),
      ),
    ).toBe(true);
  });

  it("rejects a sequence containing a transformation from another system", () => {
    const engine = makeEngine([1]);
    const other = makeEngine([2]);
    const invalid = new PermutationAction(
      other,
      TOY_RING,
      createPermutation(Array.from({ length: 24 }, (_, i) => i)),
    );
    expect(() => composeTransformations(engine, TOY_RING, [invalid])).toThrow(
      /different geometry/,
    );
  });

  it("rejects a sequence containing a transformation from another ring", () => {
    const engine = makeEngine([1]);
    const otherRing = createRingParameters(19n, 4);
    const invalid = new RingAutomorphism(engine, otherRing, 3);
    expect(() => composeTransformations(engine, TOY_RING, [invalid])).toThrow(
      /incompatible ring/,
    );
  });

  it("does not assume transformations commute", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const a = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      makePolynomial(1n),
    );
    const b = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(1),
      slot(2),
      makePolynomial(1n),
    );
    const ab = composeTransformations(engine, TOY_RING, [a, b]).apply(state);
    const ba = composeTransformations(engine, TOY_RING, [b, a]).apply(state);
    expect(ab.equals(ba)).toBe(false);
  });

  it("supports deterministic repeated composition", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const a = new RingAutomorphism(engine, TOY_RING, 3);
    const sequence = composeTransformations(engine, TOY_RING, [a, a, a, a]);
    expect(sequence.apply(state).equals(state)).toBe(true);
  });

  it("does not mutate a caller-owned step array", () => {
    const engine = makeEngine([1]);
    const steps = [new RingAutomorphism(engine, TOY_RING, 3)];
    const sequence = composeTransformations(engine, TOY_RING, steps);
    steps.push(new RingAutomorphism(engine, TOY_RING, 1));
    expect(sequence.steps).toHaveLength(1);
    expect(Object.isFrozen(sequence.steps)).toBe(true);
  });

  it("validates the state context before applying an empty sequence", () => {
    const engine = makeEngine([1]);
    const identity = identityTransformation(engine, TOY_RING);
    const state = makeState(makeEngine([2]));
    expect(() => identity.apply(state)).toThrow(/different ordered geometry/);
  });

  it("works on an empty system for an empty sequence", () => {
    const engine = makeEngine([]);
    const state = makeState(engine);
    const identity = identityTransformation(engine, TOY_RING);
    expect(identity.apply(state).equals(state)).toBe(true);
  });

  it("rejects invalid transformation arrays", () => {
    const engine = makeEngine([1]);
    expect(() =>
      composeTransformations(engine, TOY_RING, null as never),
    ).toThrow(/steps must be an array/);
    expect(() => composeTransformations(engine, TOY_RING, [], "   ")).toThrow(
      /non-empty/,
    );
  });
});
