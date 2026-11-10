import { describe, expect, it } from "vitest";
import {
  MAX_SUPPORTED_TRANSFORMATION_STEPS,
  Polynomial,
  PolynomialCoupling,
  PolynomialState,
  RingAutomorphism,
  SlotIndexingEngine,
  applyTransformations,
  composeTransformations,
  createRingParameters,
  createTransformationContext,
  identityTransformation,
  makeSlotId,
  validateTransformationName,
} from "../../src/index.js";

describe("Layer 3 contract validation and integration", () => {
  const geometry = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1]));
  const ring = createRingParameters(17n, 4);
  const state = PolynomialState.zero(geometry, ring);

  it("rejects empty, overlong, and control-character transformation names", () => {
    expect(() => validateTransformationName("   ")).toThrow(RangeError);
    expect(() => validateTransformationName("x".repeat(161))).toThrow(/160/);
    expect(() => validateTransformationName("invalid\nlabel")).toThrow(/control characters/);
    expect(() => validateTransformationName(42)).toThrow(TypeError);
  });

  it("rejects sequences above the configured operation-count cap", () => {
    const identity = identityTransformation(geometry, ring);
    const steps = Array.from({ length: MAX_SUPPORTED_TRANSFORMATION_STEPS + 1 }, () => identity);
    expect(() => composeTransformations(geometry, ring, steps)).toThrow(/supported limit/);
  });

  it("rejects sparse transformation arrays", () => {
    const sparse = new Array(1) as never[];
    expect(() => applyTransformations(state, sparse)).toThrow(/missing/);
  });

  it("validates transformation results after every custom step", () => {
    const context = createTransformationContext(geometry, ring);
    const malicious = {
      kind: "sequence",
      name: "invalid-result",
      systemKey: context.systemKey,
      ringKey: context.ringKey,
      apply: () => undefined,
      inverse: () => malicious,
    } as never;
    const sequence = composeTransformations(geometry, ring, [malicious]);
    expect(() => sequence.apply(state)).toThrow(/PolynomialState/);
    expect(state.values.every((value) => value.isZero())).toBe(true);
  });

  it("keeps a valid ordered sequence atomic when a later transform fails", () => {
    const context = createTransformationContext(geometry, ring);
    const first = {
      kind: "sequence",
      name: "identity-copy",
      systemKey: context.systemKey,
      ringKey: context.ringKey,
      apply: (input: PolynomialState) => input,
      inverse: () => first,
    } as never;
    const failure = {
      kind: "sequence",
      name: "throws",
      systemKey: context.systemKey,
      ringKey: context.ringKey,
      apply: () => {
        throw new Error("synthetic transformation failure");
      },
      inverse: () => failure,
    } as never;
    const sequence = composeTransformations(geometry, ring, [first, failure]);
    expect(() => sequence.apply(state)).toThrow("synthetic transformation failure");
    expect(state.values.every((value) => value.isZero())).toBe(true);
  });

  it("restores a polynomial state after a coupling-plus-automorphism sequence and its inverse", () => {
    const initial = PolynomialState.fromInitializer(geometry, ring, (slot) =>
      Polynomial.fromCoefficients(ring, [BigInt(Number(slot) + 1), 1n]),
    );
    const coefficient = Polynomial.fromCoefficients(ring, [2n, 3n]);
    const coupling = new PolynomialCoupling(geometry, ring, makeSlotId(0), makeSlotId(1), coefficient);
    const automorphism = new RingAutomorphism(geometry, ring, 3);
    const sequence = composeTransformations(geometry, ring, [coupling, automorphism]);
    const transformed = sequence.apply(initial);

    expect(transformed.equals(initial)).toBe(false);
    expect(sequence.inverse().apply(transformed).equals(initial)).toBe(true);
  });

  it("returns the same value from direct application and sequence composition", () => {
    const initial = PolynomialState.fromInitializer(geometry, ring, (slot) =>
      Polynomial.fromCoefficients(ring, [BigInt(Number(slot) + 2)]),
    );
    const identity = identityTransformation(geometry, ring);
    expect(applyTransformations(initial, [identity]).equals(identity.apply(initial))).toBe(true);
  });
});
