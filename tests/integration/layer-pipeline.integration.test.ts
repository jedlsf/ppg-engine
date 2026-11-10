import { describe, expect, it } from "vitest";
import {
  FaceId,
  PPGEngine,
  Polynomial,
  createCubeNetwork,
  resolveFaceConnections,
  makeCubeId,
} from "../../src/index.js";

describe("Layer 1 → Layer 2 → Layer 3 integration", () => {
  it("moves polynomial payloads across topology-resolved adjacent cube faces and reverses the operation", () => {
    const engine = new PPGEngine({
      cubes: [2, 2],
      ring: { modulus: 17n, degree: 4 },
    });
    engine.initialize((slot) =>
      Polynomial.fromCoefficients(engine.ring, [BigInt(Number(slot) + 1)]),
    );

    const network = createCubeNetwork(engine.geometry, [
      { cubeId: makeCubeId(0), position: { x: 0, y: 0, z: 0 }, orientation: 0 as never },
      { cubeId: makeCubeId(1), position: { x: 1, y: 0, z: 0 }, orientation: 0 as never },
    ]);
    const connections = resolveFaceConnections(engine.geometry, network);
    const rightConnection = connections.find(
      (connection) => connection.cubeA === makeCubeId(0) &&
        connection.faceA === FaceId.RIGHT &&
        connection.cubeB === makeCubeId(1) &&
        connection.faceB === FaceId.LEFT,
    );

    expect(rightConnection).toBeDefined();
    const before = engine.state;
    engine.applyFaceExchange(rightConnection!);
    expect(engine.state.equals(before)).toBe(false);
    expect(engine.undo()).toBe(true);
    expect(engine.state.equals(before)).toBe(true);
    expect(engine.redo()).toBe(true);
    expect(engine.state.equals(before)).toBe(false);
  });

  it("supports geometry permutations followed by polynomial-aware coupling", () => {
    const engine = new PPGEngine({
      cubes: [1],
      ring: { modulus: 17n, degree: 4 },
    });
    const seed = Polynomial.fromCoefficients(engine.ring, [3n, 2n]);
    engine.setPolynomial(0, seed);
    engine.applyFaceTurn({ cubeId: makeCubeId(0), faceId: FaceId.UP, quarterTurns: 1 });
    engine.applyCoupling(0, 1, Polynomial.one(engine.ring));

    expect(engine.getPolynomial(1).isZero()).toBe(false);
    expect(engine.undo()).toBe(true);
    expect(engine.undo()).toBe(true);
    expect(engine.getPolynomial(0).equals(seed)).toBe(true);
  });

  it("commits a composed transformation only after the complete sequence succeeds", () => {
    const engine = new PPGEngine({
      cubes: [1],
      ring: { modulus: 17n, degree: 4 },
    });
    engine.setPolynomial(0, Polynomial.fromCoefficients(engine.ring, [1n]));
    const before = engine.state;
    const bad = {
      kind: "sequence",
      name: "broken-step",
      systemKey: "ppc-layer1-v1|0:1",
      ringKey: "Z_17[X]/(X^4+1)",
      apply: () => {
        throw new Error("integration failure");
      },
      inverse: () => bad,
    } as never;

    expect(() => engine.applySequence([bad])).toThrow("integration failure");
    expect(engine.state.equals(before)).toBe(true);
    expect(engine.getHistory()).toHaveLength(1);
  });
});
