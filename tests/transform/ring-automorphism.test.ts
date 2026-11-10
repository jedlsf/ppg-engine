import { describe, expect, it } from "vitest";

import { makeEngine, makePolynomial, makeState, TOY_RING } from "./helpers.js";
import {
  createRingAutomorphism,
  gcdNumber,
  modularInverseNumber,
  RingAutomorphism,
} from "../../src/core/transform/index.js";
import {
  createRingParameters,
  Polynomial,
  PolynomialState,
} from "../../src/core/polynomial/index.js";

describe("Layer 3: substitution ring automorphism X -> X^k", () => {
  it("maps X to X^3 for degree 4", () => {
    const engine = makeEngine([1]);
    const automorphism = new RingAutomorphism(engine, TOY_RING, 3);
    const x = Polynomial.monomial(TOY_RING, 1n, 1);
    expect(
      automorphism
        .applyPolynomial(x)
        .equals(Polynomial.monomial(TOY_RING, 1n, 3)),
    ).toBe(true);
  });

  it("reduces substituted exponents with X^n = -1", () => {
    const engine = makeEngine([1]);
    const automorphism = new RingAutomorphism(engine, TOY_RING, 3);
    const p = makePolynomial(2n, 3n, 4n, 5n);
    const expected = makePolynomial(2n, 5n, 13n, 3n);
    expect(automorphism.applyPolynomial(p).equals(expected)).toBe(true);
  });

  it("preserves zero and one", () => {
    const engine = makeEngine([1]);
    const automorphism = new RingAutomorphism(engine, TOY_RING, 3);
    expect(
      automorphism.applyPolynomial(Polynomial.zero(TOY_RING)).isZero(),
    ).toBe(true);
    expect(
      automorphism
        .applyPolynomial(Polynomial.one(TOY_RING))
        .equals(Polynomial.one(TOY_RING)),
    ).toBe(true);
  });

  it("preserves addition", () => {
    const automorphism = new RingAutomorphism(makeEngine([1]), TOY_RING, 3);
    const a = makePolynomial(1n, 2n, 3n, 4n);
    const b = makePolynomial(5n, 6n, 7n, 8n);
    expect(
      automorphism
        .applyPolynomial(a.add(b))
        .equals(
          automorphism.applyPolynomial(a).add(automorphism.applyPolynomial(b)),
        ),
    ).toBe(true);
  });

  it("preserves multiplication", () => {
    const automorphism = new RingAutomorphism(makeEngine([1]), TOY_RING, 3);
    const a = makePolynomial(1n, 2n, 3n, 4n);
    const b = makePolynomial(5n, 6n, 7n, 8n);
    expect(
      automorphism
        .applyPolynomial(a.multiply(b))
        .equals(
          automorphism
            .applyPolynomial(a)
            .multiply(automorphism.applyPolynomial(b)),
        ),
    ).toBe(true);
  });

  it("is invertible and the constructed inverse restores an arbitrary polynomial", () => {
    const engine = makeEngine([1]);
    const automorphism = new RingAutomorphism(engine, TOY_RING, 3);
    const p = makePolynomial(16n, 5n, 8n, 11n);
    expect(
      automorphism
        .inverse()
        .applyPolynomial(automorphism.applyPolynomial(p))
        .equals(p),
    ).toBe(true);
  });

  it("uses the multiplicative inverse exponent modulo 2n", () => {
    const automorphism = new RingAutomorphism(makeEngine([1]), TOY_RING, 5);
    expect(automorphism.inverse().exponent).toBe(5);
    expect((automorphism.inverse().exponent * automorphism.exponent) % 8).toBe(
      1,
    );
  });

  it("canonicalizes exponents modulo 2n", () => {
    const a = new RingAutomorphism(makeEngine([1]), TOY_RING, 11);
    expect(a.exponent).toBe(3);
  });

  it("transforms all slot polynomials and inverse restores the state", () => {
    const engine = makeEngine([1, 2]);
    const state = makeState(engine);
    const automorphism = new RingAutomorphism(engine, TOY_RING, 3);
    const result = automorphism.apply(state);
    expect(result.equals(state)).toBe(false);
    expect(automorphism.inverse().apply(result).equals(state)).toBe(true);
  });

  it("works over a composite coefficient modulus when the substitution exponent is valid", () => {
    const engine = makeEngine([1]);
    const compositeRing = createRingParameters(15n, 4);
    const automorphism = new RingAutomorphism(engine, compositeRing, 3);
    const p = Polynomial.fromCoefficients(compositeRing, [1n, 2n, 3n, 4n]);
    expect(
      automorphism
        .inverse()
        .applyPolynomial(automorphism.applyPolynomial(p))
        .equals(p),
    ).toBe(true);
  });

  it("rejects exponent values that do not define the specified automorphism", () => {
    const engine = makeEngine([1]);
    for (const exponent of [
      0,
      -1,
      2,
      4,
      8,
      2.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => new RingAutomorphism(engine, TOY_RING, exponent)).toThrow();
    }
  });

  it("rejects an incompatible polynomial ring and state context", () => {
    const engine = makeEngine([1]);
    const automorphism = createRingAutomorphism(engine, TOY_RING, 3);
    const otherRing = createRingParameters(19n, 4);
    expect(() =>
      automorphism.applyPolynomial(Polynomial.zero(otherRing)),
    ).toThrow(/incompatible ring/);
    expect(() =>
      automorphism.apply(PolynomialState.zero(engine, otherRing)),
    ).toThrow(/incompatible polynomial ring/);
  });

  it("provides correct integer gcd and modular inverse helpers", () => {
    expect(gcdNumber(12, 8)).toBe(4);
    expect(gcdNumber(3, 8)).toBe(1);
    expect(modularInverseNumber(3, 8)).toBe(3);
    expect(modularInverseNumber(5, 8)).toBe(5);
    expect(() => modularInverseNumber(2, 8)).toThrow(
      /no multiplicative inverse/,
    );
    expect(() => gcdNumber(-1, 4)).toThrow();
  });
});
