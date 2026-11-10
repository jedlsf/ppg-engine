import { describe, expect, it } from "vitest";
import { SlotIndexingEngine } from "../../src/core/geometry/index.js";
import {
  coordinateToSurfaceAddress,
  faceForNormal,
  normalForFace,
  surfaceAddressToCoordinate,
  surfaceAddressToSlotId,
} from "../../src/core/geometry/index.js";
import { FaceId, makeCubeId } from "../../src/core/geometry/index.js";

describe("Layer 1: surface geometry", () => {
  it.each([1, 2, 3, 4, 7])(
    "round-trips every surface slot for grid size %i",
    (gridSize) => {
      const engine = new SlotIndexingEngine(
        SlotIndexingEngine.createSpec([gridSize]),
      );
      const seen = new Set<string>();

      for (const entry of engine.entries()) {
        const address = coordinateToSurfaceAddress(engine, entry.coordinate);
        const coordinate = surfaceAddressToCoordinate(engine, address);
        expect(engine.coordinateToSlotId(coordinate)).toBe(entry.slotId);
        expect(surfaceAddressToSlotId(engine, address)).toBe(entry.slotId);
        expect(faceForNormal(address.normal)).toBe(entry.coordinate.faceId);
        seen.add(
          `${address.position.x},${address.position.y},${address.position.z}|${address.normal.x},${address.normal.y},${address.normal.z}`,
        );
      }

      // Position alone isn't unique on edges/corners. Position+normal is.
      expect(seen.size).toBe(engine.spec.totalSlots);
    },
  );

  it("uses the documented coordinate convention", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    const cubeId = makeCubeId(0);

    expect(
      coordinateToSurfaceAddress(engine, {
        cubeId,
        faceId: FaceId.UP,
        u: 0,
        v: 0,
      }),
    ).toEqual({
      cubeId,
      position: { x: 0, y: 2, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
    });
    expect(
      coordinateToSurfaceAddress(engine, {
        cubeId,
        faceId: FaceId.FRONT,
        u: 0,
        v: 0,
      }),
    ).toEqual({
      cubeId,
      position: { x: 0, y: 2, z: 2 },
      normal: { x: 0, y: 0, z: 1 },
    });
    expect(
      coordinateToSurfaceAddress(engine, {
        cubeId,
        faceId: FaceId.BACK,
        u: 0,
        v: 0,
      }),
    ).toEqual({
      cubeId,
      position: { x: 2, y: 2, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
    });
  });

  it("keeps surface positions within the cube bounds", () => {
    const engine = new SlotIndexingEngine(
      SlotIndexingEngine.createSpec([2, 3, 4]),
    );
    for (const entry of engine.entries()) {
      const n = engine.getCube(entry.coordinate.cubeId).gridSize;
      const { position } = coordinateToSurfaceAddress(engine, entry.coordinate);
      for (const value of [position.x, position.y, position.z]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(n);
      }
    }
  });

  it("works with explicit non-contiguous cube IDs", () => {
    const spec = {
      cubes: [
        { id: makeCubeId(7), gridSize: 2 },
        { id: makeCubeId(42), gridSize: 3 },
      ],
      totalSlots: 6 * 2 * 2 + 6 * 3 * 3,
    };
    const engine = new SlotIndexingEngine(spec);
    const address = coordinateToSurfaceAddress(engine, {
      cubeId: makeCubeId(42),
      faceId: FaceId.RIGHT,
      u: 2,
      v: 1,
    });
    expect(surfaceAddressToCoordinate(engine, address)).toEqual({
      cubeId: makeCubeId(42),
      faceId: FaceId.RIGHT,
      u: 2,
      v: 1,
    });
  });

  it("returns canonical, immutable face normals", () => {
    expect(normalForFace(FaceId.UP)).toEqual({ x: 0, y: 1, z: 0 });
    expect(Object.isFrozen(normalForFace(FaceId.FRONT))).toBe(true);
    expect(() => normalForFace(99 as FaceId)).toThrowError(/Invalid FaceId/);
    expect(() => faceForNormal({ x: 1, y: 1, z: 0 } as never)).toThrowError(
      /axis-aligned unit normal/,
    );
  });

  it("rejects a position that does not lie on the normal-indicated face plane", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    expect(() =>
      surfaceAddressToCoordinate(engine, {
        cubeId: makeCubeId(0),
        position: { x: 1, y: 1, z: 1 },
        normal: { x: 0, y: 1, z: 0 },
      }),
    ).toThrowError(/UP face plane/);
  });

  it("rejects out-of-range, fractional, and malformed positions", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    for (const x of [-1, 3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        surfaceAddressToCoordinate(engine, {
          cubeId: makeCubeId(0),
          position: { x, y: 2, z: 1 },
          normal: { x: 0, y: 1, z: 0 },
        }),
      ).toThrowError(/Surface position x=/);
    }
  });
});
