import { describe, expect, it } from "vitest";
import {
  FaceId,
  PPGEngine,
  Polynomial,
  makeCubeId,
} from "../../src/index.js";

function makeEngine(maxHistoryEntries = 1_000): PPGEngine {
  return new PPGEngine({
    cubes: [2],
    ring: { modulus: 17n, degree: 4 },
    maxHistoryEntries,
  });
}

describe("PPGEngine end-to-end behavior", () => {
  it("accepts an empty geometry as a valid zero-slot engine", () => {
    const engine = new PPGEngine({ cubes: [], ring: { modulus: 17n, degree: 4 } });
    expect(engine.totalSlots).toBe(0);
    expect(engine.state.values).toHaveLength(0);
  });

  it("rejects sparse cube configuration and unsupported history limits", () => {
    const sparse = new Array<number>(1);
    expect(() => new PPGEngine({ cubes: sparse, ring: { modulus: 17n, degree: 4 } })).toThrow(/sparse/);
    expect(() => makeEngine(-1)).toThrow(/maxHistoryEntries/);
    expect(() => makeEngine(10_001)).toThrow(/maxHistoryEntries/);
  });

  it("does not change current state when initialization callback fails", () => {
    const engine = makeEngine();
    engine.setPolynomial(0, Polynomial.one(engine.ring));
    const before = engine.state;

    expect(() => engine.initialize(() => {
      throw new Error("initializer failed");
    })).toThrow("initializer failed");
    expect(engine.state.equals(before)).toBe(true);
  });

  it("validates names even for empty transformation sequences", () => {
    const engine = makeEngine();
    const before = engine.state;
    expect(() => engine.applySequence([], "\n")).toThrow(/control characters/);
    expect(engine.state.equals(before)).toBe(true);
  });

  it("bounds retained operation history and keeps undo/redo consistent", () => {
    const engine = makeEngine(2);
    engine.setPolynomial(0, Polynomial.fromCoefficients(engine.ring, [1n]));
    engine.setPolynomial(0, Polynomial.fromCoefficients(engine.ring, [2n]));
    engine.setPolynomial(0, Polynomial.fromCoefficients(engine.ring, [3n]));

    expect(engine.getHistory()).toHaveLength(2);
    expect(engine.getDiagnostics().undoDepth).toBe(2);
    expect(engine.getPolynomial(0).coefficient(0)).toBe(3n);

    expect(engine.undo()).toBe(true);
    expect(engine.getPolynomial(0).coefficient(0)).toBe(2n);
    expect(engine.undo()).toBe(true);
    expect(engine.getPolynomial(0).coefficient(0)).toBe(1n);
    expect(engine.undo()).toBe(false);
    expect(engine.redo()).toBe(true);
    expect(engine.getPolynomial(0).coefficient(0)).toBe(2n);
  });

  it("can disable operation history without disabling state changes", () => {
    const engine = makeEngine(0);
    engine.setPolynomial(0, Polynomial.one(engine.ring));
    expect(engine.getPolynomial(0).isZero()).toBe(false);
    expect(engine.getHistory()).toHaveLength(0);
    expect(engine.undo()).toBe(false);
  });

  it("applies face turns and slice moves while retaining undo/redo", () => {
    const engine = makeEngine();
    engine.initialize((slot) => Polynomial.fromCoefficients(engine.ring, [BigInt(Number(slot) + 1)]));

    const before = engine.state;
    engine.applyFaceTurn({ cubeId: makeCubeId(0), faceId: FaceId.FRONT, quarterTurns: 1 });
    expect(engine.state.equals(before)).toBe(false);
    expect(engine.undo()).toBe(true);
    expect(engine.state.equals(before)).toBe(true);

    engine.applySliceMove({ cubeId: makeCubeId(0), axis: "y", layer: 0, quarterTurns: -1 });
    expect(engine.state.equals(before)).toBe(false);
    expect(engine.undo()).toBe(true);
    expect(engine.state.equals(before)).toBe(true);
  });

  it("rejects malformed moves and preserves state and history", () => {
    const engine = makeEngine();
    const before = engine.state;
    expect(() => engine.applyFaceTurn({ cubeId: makeCubeId(0), faceId: 99 as FaceId, quarterTurns: 1 })).toThrow();
    expect(() => engine.applySliceMove({ cubeId: makeCubeId(0), axis: "invalid" as never, layer: 0, quarterTurns: 1 })).toThrow();
    expect(engine.state.equals(before)).toBe(true);
    expect(engine.getHistory()).toHaveLength(0);
  });

  it("uses the flattened coefficient API transactionally", () => {
    const engine = makeEngine();
    const before = engine.getStateCoefficients();
    const sparse = new Array<bigint>(engine.totalSlots * engine.ring.degree);
    expect(() => engine.setStateCoefficients(sparse)).toThrow(/sparse/);
    expect(engine.getStateCoefficients()).toEqual(before);

    const coefficients = Array<bigint>(engine.totalSlots * engine.ring.degree).fill(0n);
    coefficients[0] = 9n;
    engine.setStateCoefficients(coefficients);
    expect(engine.getStateCoefficients()).toEqual(coefficients);
    expect(engine.getPolynomial(0).coefficient(0)).toBe(9n);
  });

  it("validates a state from a different ring without changing current state", () => {
    const engine = makeEngine();
    const other = new PPGEngine({ cubes: [2], ring: { modulus: 19n, degree: 4 } });
    const before = engine.state;

    expect(() => engine.setState(other.state)).toThrow(/incompatible ring/);
    expect(engine.state.equals(before)).toBe(true);
  });

  it("uses explicit, non-contiguous cube identifiers", () => {
    const engine = new PPGEngine({
      cubes: [
        { id: makeCubeId(12), gridSize: 1 },
        { id: makeCubeId(91), gridSize: 2 },
      ],
      ring: { modulus: 17n, degree: 4 },
    });
    expect(engine.geometry.getCube(makeCubeId(12)).gridSize).toBe(1);
    expect(engine.geometry.getCube(makeCubeId(91)).gridSize).toBe(2);
    expect(engine.totalSlots).toBe(30);
  });
});
