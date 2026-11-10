import { describe, expect, it } from "vitest";
import {
  CUBE_ORIENTATIONS,
  FaceId,
  IDENTITY_ORIENTATION,
  SlotIndexingEngine,
  createCubeNetwork,
  makeCubeId,
  worldNormalForFace,
} from "../../src/core/geometry/index.js";
import type {
  CubePlacement,
  FaceNormal,
} from "../../src/core/geometry/index.js";

function findOrientation(localFace: FaceId, desired: FaceNormal) {
  const item = CUBE_ORIENTATIONS.find((orientation) => {
    const normal = worldNormalForFace(orientation.id, localFace);
    return (
      normal.x === desired.x && normal.y === desired.y && normal.z === desired.z
    );
  });
  if (!item) throw new Error("Test setup error: no matching orientation");
  return item.id;
}

function placement(
  cubeId: number,
  x: number,
  y = 0,
  z = 0,
  orientation = IDENTITY_ORIENTATION,
): CubePlacement {
  return { cubeId: makeCubeId(cubeId), position: { x, y, z }, orientation };
}

describe("Layer 1: multi-cube topology", () => {
  it("detects a single shared face between adjacent identity-oriented cubes", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([3, 3]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1),
    ]);
    expect(network.connections).toHaveLength(1);
    expect(network.connections[0]).toMatchObject({
      cubeA: makeCubeId(0),
      faceA: FaceId.RIGHT,
      cubeB: makeCubeId(1),
      faceB: FaceId.LEFT,
      worldNormalFromA: { x: 1, y: 0, z: 0 },
    });
    expect(network.placements.map((p) => p.cubeId)).toEqual([
      makeCubeId(0),
      makeCubeId(1),
    ]);
  });

  it("detects neighbors along all three world axes", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2, 2, 2]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0, 0, 0),
      placement(1, 1, 0, 0),
      placement(2, 0, 1, 0),
      placement(3, 0, 0, 1),
    ]);
    expect(network.connections).toHaveLength(3);
    expect(network.connections.map((c) => c.worldNormalFromA)).toEqual([
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    ]);
  });

  it("handles non-contiguous cube IDs and normalizes placements to spec order", () => {
    const engine = new SlotIndexingEngine({
      cubes: [
        { id: makeCubeId(42), gridSize: 2 },
        { id: makeCubeId(7), gridSize: 3 },
      ],
      totalSlots: 6 * 4 + 6 * 9,
    });
    const network = createCubeNetwork(engine, [
      placement(7, 1),
      placement(42, 0),
    ]);
    expect(network.placements.map((p) => p.cubeId)).toEqual([
      makeCubeId(42),
      makeCubeId(7),
    ]);
    expect(network.connections[0]).toMatchObject({
      cubeA: makeCubeId(42),
      cubeB: makeCubeId(7),
    });
  });

  it("uses orientation to choose the local face meeting a world neighbor", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([3, 3]),
    );
    const bOrientation = findOrientation(FaceId.FRONT, { x: -1, y: 0, z: 0 });
    const network = createCubeNetwork(engine, [
      placement(0, 0),
      placement(1, 1, 0, 0, bOrientation),
    ]);
    expect(network.connections).toHaveLength(1);
    expect(network.connections[0]!.faceA).toBe(FaceId.RIGHT);
    expect(network.connections[0]!.faceB).toBe(FaceId.FRONT);
  });

  it("does not connect diagonal or separated cube positions", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2, 2]),
    );
    const network = createCubeNetwork(engine, [
      placement(0, 0, 0, 0),
      placement(1, 1, 1, 0),
      placement(2, 3, 0, 0),
    ]);
    expect(network.connections).toHaveLength(0);
  });

  it("rejects missing, duplicate, unknown, overlapping, or malformed placements", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 2]),
    );
    expect(() => createCubeNetwork(engine, [placement(0, 0)])).toThrowError(
      /Expected 2 placements/,
    );
    expect(() =>
      createCubeNetwork(engine, [placement(0, 0), placement(0, 1)]),
    ).toThrowError(/Duplicate placement/);
    expect(() =>
      createCubeNetwork(engine, [placement(0, 0), placement(99, 1)]),
    ).toThrowError(/Unknown CubeId/);
    expect(() =>
      createCubeNetwork(engine, [placement(0, 0), placement(1, 0)]),
    ).toThrowError(/Overlapping cube placements/);
    expect(() =>
      createCubeNetwork(engine, [
        placement(0, 0),
        {
          ...placement(1, 1),
          position: { x: 1.5, y: 0, z: 0 },
        },
      ]),
    ).toThrowError(/safe integer/);
    expect(() =>
      createCubeNetwork(engine, [
        placement(0, 0),
        {
          ...placement(1, 1),
          orientation: 99 as never,
        },
      ]),
    ).toThrowError(/CubeOrientationId/);
  });

  it("accepts an empty system with no placements or connections", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([]));
    expect(createCubeNetwork(engine, [])).toMatchObject({
      placements: [],
      connections: [],
      systemKey: expect.any(String),
    });
  });
});
