import { describe, expect, it } from "vitest";
import {
  PPGEngine,
  Polynomial,
  makeCubeId,
  makeSlotId,
} from "../../src/index.js";

function createEngine(): PPGEngine {
  return new PPGEngine({
    cubes: [2],
    ring: { modulus: 17n, degree: 4 },
  });
}

describe("PPGEngine", () => {
  it("creates a canonical geometry and zero polynomial state", () => {
    const engine = createEngine();

    expect(engine.totalSlots).toBe(24);
    expect(engine.state.values).toHaveLength(24);
    expect(engine.state.values.every((value) => value.isZero())).toBe(true);
    expect(engine.getDiagnostics().ringModulus).toBe("17");
  });

  it("supports explicit cube IDs and polynomial state updates", () => {
    const engine = new PPGEngine({
      cubes: [{ id: makeCubeId(42), gridSize: 1 }],
      ring: { modulus: 17n, degree: 4 },
    });
    const value = Polynomial.fromCoefficients(engine.ring, [1n, 2n]);

    engine.setPolynomial(0, value);

    expect(engine.getPolynomial(0).equals(value)).toBe(true);
    expect(engine.undo()).toBe(true);
    expect(engine.getPolynomial(0).isZero()).toBe(true);
    expect(engine.redo()).toBe(true);
    expect(engine.getPolynomial(0).equals(value)).toBe(true);
  });

  it("applies reversible polynomial coupling and ring automorphisms", () => {
    const engine = createEngine();
    const source = Polynomial.fromCoefficients(engine.ring, [1n, 2n]);
    const coefficient = Polynomial.one(engine.ring);

    engine.setPolynomial(0, source);
    engine.applyCoupling(makeSlotId(0), makeSlotId(1), coefficient);

    expect(engine.getPolynomial(1).equals(source)).toBe(true);
    expect(engine.undo()).toBe(true);
    expect(engine.getPolynomial(1).isZero()).toBe(true);

    engine.applyRingAutomorphism(3);
    expect(engine.undo()).toBe(true);
    expect(engine.getPolynomial(0).equals(source)).toBe(true);
  });

  it("loads and exports a canonical flattened coefficient vector", () => {
    const engine = createEngine();
    const coefficients = Array<bigint>(engine.totalSlots * engine.ring.degree).fill(0n);
    coefficients[0] = 3n;
    coefficients[1] = 4n;

    engine.setStateCoefficients(coefficients);

    expect(engine.getStateCoefficients()).toEqual(coefficients);
    expect(engine.getPolynomial(0).coefficients).toEqual([3n, 4n, 0n, 0n]);
  });

  it("rejects a state from a different geometry without changing the current state", () => {
    const engine = createEngine();
    const other = new PPGEngine({
      cubes: [1],
      ring: { modulus: 17n, degree: 4 },
    });
    const before = engine.getStateCoefficients();

    expect(() => engine.setState(other.state)).toThrow(/different ordered geometry/);
    expect(engine.getStateCoefficients()).toEqual(before);
  });

  it("restores the initial state with reset and clears the timeline", () => {
    const engine = createEngine();
    engine.setPolynomial(0, Polynomial.one(engine.ring));
    expect(engine.getHistory()).toHaveLength(1);

    engine.reset();

    expect(engine.getPolynomial(0).isZero()).toBe(true);
    expect(engine.getHistory()).toHaveLength(0);
    expect(engine.getDiagnostics().undoDepth).toBe(0);
  });
});
