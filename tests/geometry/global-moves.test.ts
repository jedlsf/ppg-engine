import { describe, expect, it } from "vitest";
import {
  FaceId,
  IDENTITY_ORIENTATION,
  SlotIndexingEngine,
  applyGlobalPermutation,
  composeGlobalPermutations,
  createCubeNetwork,
  createFaceExchangePermutation,
  createFaceTurnPermutation,
  identityPermutation,
  invertPermutation,
  makeCubeId,
  resolveFaceConnections,
} from "../../src/core/geometry/index.js";
import type {
  CubePlacement,
  ResolvedFaceConnection,
} from "../../src/core/geometry/index.js";

function placement(cubeId: number, x: number, y = 0, z = 0): CubePlacement {
  return {
    cubeId: makeCubeId(cubeId),
    position: { x, y, z },
    orientation: IDENTITY_ORIENTATION,
  };
}

describe("Layer 1: global moves", () => {
  it("swaps corresponding payloads across an equal-resolution face connection", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([3, 3]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const connection = resolveFaceConnections(engine, network)[0]!;
    const permutation = createFaceExchangePermutation(engine, connection);
    const initial = Array.from(
      { length: engine.spec.totalSlots },
      (_, index) => `payload-${index}`,
    );
    const output = applyGlobalPermutation(engine, initial, permutation);

    for (const pair of connection.pairs) {
      expect(output[Number(pair.slotA)]).toBe(initial[Number(pair.slotB)]);
      expect(output[Number(pair.slotB)]).toBe(initial[Number(pair.slotA)]);
    }
  });

  it("face exchange is an involution", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const exchange = createFaceExchangePermutation(
      engine,
      resolveFaceConnections(engine, network)[0]!,
    );
    const twice = composeGlobalPermutations(engine, [exchange, exchange]);
    expect(twice.sourceToDestination).toEqual(
      identityPermutation(engine.spec.totalSlots).sourceToDestination,
    );
  });

  it("refuses to exchange cells across unequal resolutions", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 3]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const connection = resolveFaceConnections(engine, network)[0]!;
    expect(connection.mappingStatus).toBe("different-resolution");
    expect(() =>
      createFaceExchangePermutation(engine, connection),
    ).toThrowError(/equal face resolutions/);
  });

  it("composes local moves and face exchanges in execution order", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([3, 3]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const exchange = createFaceExchangePermutation(
      engine,
      resolveFaceConnections(engine, network)[0]!,
    );
    const local = createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(0),
      faceId: FaceId.UP,
      quarterTurns: 1,
    });
    const combined = composeGlobalPermutations(engine, [local, exchange]);
    const initial = Array.from(
      { length: engine.spec.totalSlots },
      (_, index) => index,
    );
    const result = applyGlobalPermutation(engine, initial, combined);
    const expected = applyGlobalPermutation(
      engine,
      applyGlobalPermutation(engine, initial, local),
      exchange,
    );
    expect(result).toEqual(expected);
  });

  it("rejects a local permutation with the wrong global size", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2]),
    );
    expect(() =>
      composeGlobalPermutations(engine, [identityPermutation(24)]),
    ).toThrowError(/expected 48/);
  });

  it("rejects forged or incomplete connection records", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const connection = resolveFaceConnections(engine, network)[0]!;
    const incomplete = {
      ...connection,
      pairs: connection.pairs.slice(0, 3),
    } as ResolvedFaceConnection;
    expect(() =>
      createFaceExchangePermutation(engine, incomplete),
    ).toThrowError(/complete equal-resolution mapping/);
  });

  it("keeps disconnected cube slots unchanged under a face exchange", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2, 3]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
      placement(2, 5),
    ]);
    const connection = resolveFaceConnections(engine, network)[0]!;
    const exchange = createFaceExchangePermutation(engine, connection);
    const otherRange = engine.getCubeSlotRange(makeCubeId(2));
    for (
      let slot = Number(otherRange.start);
      slot < otherRange.endExclusive;
      slot += 1
    ) {
      expect(exchange.sourceToDestination[slot]).toBe(slot);
    }
  });

  it("rejects using a resolved connection with a different system specification", () => {
    const sourceEngine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2]),
    );
    const sourceNetwork = createCubeNetwork(sourceEngine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const connection = resolveFaceConnections(sourceEngine, sourceNetwork)[0]!;
    const otherEngine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([3, 3]),
    );
    expect(() =>
      createFaceExchangePermutation(otherEngine, connection),
    ).toThrowError(/different SystemSpec/);
  });

  it("can compose an empty operation sequence into identity", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1]));
    expect(composeGlobalPermutations(engine, []).sourceToDestination).toEqual(
      identityPermutation(engine.spec.totalSlots).sourceToDestination,
    );
  });

  it("inverse of a face exchange is itself", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([3, 3]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    const exchange = createFaceExchangePermutation(
      engine,
      resolveFaceConnections(engine, network)[0]!,
    );
    expect(invertPermutation(exchange).sourceToDestination).toEqual(
      exchange.sourceToDestination,
    );
  });
});
