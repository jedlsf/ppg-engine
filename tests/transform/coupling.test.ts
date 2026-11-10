import { describe, expect, it } from "vitest";
import { makeSlotId } from "../../src/core/geometry/index.js";

import {
  createRingParameters,
  Polynomial,
  PolynomialState,
} from "../../src/core/polynomial/index.js";

import {
  aggregatePolynomial,
  PolynomialCoupling,
} from "../../src/core/transform/index.js";
import {
  makeEngine,
  makePolynomial,
  makeState,
  slot,
  TOY_RING,
} from "./helpers.js";

describe("Layer 3: invertible polynomial coupling", () => {
  it("adds coefficient * source to target while leaving the source unchanged", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const sourceBefore = state.get(slot(0));
    const targetBefore = state.get(slot(1));
    const coefficient = makePolynomial(2n, 1n);
    const coupling = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      coefficient,
    );
    const result = coupling.apply(state);
    expect(result.get(slot(0)).equals(sourceBefore)).toBe(true);
    expect(
      result
        .get(slot(1))
        .equals(targetBefore.add(coefficient.multiply(sourceBefore))),
    ).toBe(true);
  });

  it("leaves every non-target slot unchanged", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const result = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      makePolynomial(3n),
    ).apply(state);
    for (let i = 0; i < state.values.length; i += 1) {
      if (i !== 1)
        expect(result.get(makeSlotId(i)).equals(state.get(makeSlotId(i)))).toBe(
          true,
        );
    }
  });

  it("inverse restores the exact original state", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const coupling = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(4),
      makePolynomial(2n, 3n),
    );
    expect(coupling.inverse().apply(coupling.apply(state)).equals(state)).toBe(
      true,
    );
  });

  it("is invertible even when the coefficient is not a unit", () => {
    const engine = makeEngine([1]);
    const compositeRing = createRingParameters(15n, 4);
    const state = makeState(engine, compositeRing);
    const coefficient = Polynomial.fromCoefficients(compositeRing, [
      3n,
      0n,
      0n,
      0n,
    ]);
    const coupling = new PolynomialCoupling(
      engine,
      compositeRing,
      slot(0),
      slot(2),
      coefficient,
    );
    expect(coupling.inverse().apply(coupling.apply(state)).equals(state)).toBe(
      true,
    );
  });

  it("zero coefficient acts as the identity", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const coupling = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      Polynomial.zero(TOY_RING),
    );
    expect(coupling.apply(state).equals(state)).toBe(true);
  });

  it("coupling changes aggregate sum by exactly coefficient * original source", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const coefficient = makePolynomial(2n, 1n);
    const source = state.get(slot(0));
    const beforeSum = aggregatePolynomial(state);
    const after = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      coefficient,
    ).apply(state);
    expect(
      aggregatePolynomial(after).equals(
        beforeSum.add(coefficient.multiply(source)),
      ),
    ).toBe(true);
  });

  it("rejects source and target being the same slot", () => {
    const engine = makeEngine([1]);
    expect(
      () =>
        new PolynomialCoupling(
          engine,
          TOY_RING,
          slot(1),
          slot(1),
          makePolynomial(1n),
        ),
    ).toThrow(/distinct/);
  });

  it("rejects invalid source and target slots", () => {
    const engine = makeEngine([1]);
    expect(
      () =>
        new PolynomialCoupling(
          engine,
          TOY_RING,
          makeSlotId(0),
          makeSlotId(6),
          makePolynomial(1n),
        ),
    ).toThrow(/targetSlot/);
    expect(
      () =>
        new PolynomialCoupling(
          engine,
          TOY_RING,
          0.5 as never,
          slot(1),
          makePolynomial(1n),
        ),
    ).toThrow(/sourceSlot/);
  });

  it("rejects a coefficient from a different ring", () => {
    const engine = makeEngine([1]);
    const wrongRing = createRingParameters(19n, 4);
    expect(
      () =>
        new PolynomialCoupling(
          engine,
          TOY_RING,
          slot(0),
          slot(1),
          Polynomial.zero(wrongRing),
        ),
    ).toThrow(/incompatible ring/);
  });

  it("rejects applying to a state from a different system or ring", () => {
    const engine = makeEngine([1]);
    const coupling = new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      makePolynomial(1n),
    );
    expect(() => coupling.apply(makeState(makeEngine([2])))).toThrow(
      /different ordered geometry/,
    );
    expect(() =>
      coupling.apply(
        PolynomialState.zero(engine, createRingParameters(19n, 4)),
      ),
    ).toThrow(/incompatible polynomial ring/);
  });

  it("does not mutate the input state or coefficient", () => {
    const engine = makeEngine([1]);
    const state = makeState(engine);
    const originalValues = [...state.values];
    const coefficient = makePolynomial(1n, 2n);
    const beforeEncoding = JSON.stringify(coefficient);
    new PolynomialCoupling(
      engine,
      TOY_RING,
      slot(0),
      slot(1),
      coefficient,
    ).apply(state);
    expect(state.values).toEqual(originalValues);
    expect(JSON.stringify(coefficient)).toBe(beforeEncoding);
  });
});
