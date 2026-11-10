import { describe, expect, it } from 'vitest';
import {
  createSystemSpec,
  FaceId,
  makeCubeId,
  makeSlotId,
  SlotIndexingEngine,
} from  '../../src/core/geometry/index.js';

describe('Layer 1: SlotIndexingEngine', () => {
  it('calculates total face-slot count for heterogeneous cubes', () => {
    const spec = SlotIndexingEngine.createSpec([3, 4, 2]);
    expect(spec.totalSlots).toBe(54 + 96 + 24);
    expect(spec.totalSlots).toBe(174);
  });

  it('provides a strict coordinate/slot bijection across every slot', () => {
    const spec = SlotIndexingEngine.createSpec([3, 4, 2, 1]);
    const engine = new SlotIndexingEngine(spec);
    const seenCoordinates = new Set<string>();

    for (let rawSlot = 0; rawSlot < spec.totalSlots; rawSlot += 1) {
      const slotId = makeSlotId(rawSlot);
      const coordinate = engine.slotIdToCoordinate(slotId);
      const roundTripSlot = engine.coordinateToSlotId(coordinate);

      expect(roundTripSlot).toBe(slotId);
      seenCoordinates.add(
        `${coordinate.cubeId}:${coordinate.faceId}:${coordinate.u}:${coordinate.v}`,
      );
    }

    expect(seenCoordinates.size).toBe(spec.totalSlots);
  });

  it('follows the documented canonical ordering', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3, 4]));

    expect(engine.coordinateToSlotId({
      cubeId: makeCubeId(0), faceId: FaceId.UP, u: 0, v: 0,
    })).toBe(makeSlotId(0));

    // Last slot of the first face on cube 0: u=2, v=2 => 8.
    expect(engine.coordinateToSlotId({
      cubeId: makeCubeId(0), faceId: FaceId.UP, u: 2, v: 2,
    })).toBe(makeSlotId(8));

    // DOWN is face index 1, so its first slot is 9 on a 3x3 cube.
    expect(engine.coordinateToSlotId({
      cubeId: makeCubeId(0), faceId: FaceId.DOWN, u: 0, v: 0,
    })).toBe(makeSlotId(9));

    // Cube 1 starts after 6 * 3^2 = 54 slots.
    expect(engine.coordinateToSlotId({
      cubeId: makeCubeId(1), faceId: FaceId.UP, u: 0, v: 0,
    })).toBe(makeSlotId(54));
  });

  it('supports explicit non-contiguous CubeIds', () => {
    const spec = createSystemSpec([
      { id: makeCubeId(7), gridSize: 2 },
      { id: makeCubeId(42), gridSize: 1 },
    ]);
    const engine = new SlotIndexingEngine(spec);

    expect(engine.coordinateToSlotId({
      cubeId: makeCubeId(7), faceId: FaceId.BACK, u: 1, v: 1,
    })).toBe(makeSlotId(23));
    expect(engine.coordinateToSlotId({
      cubeId: makeCubeId(42), faceId: FaceId.UP, u: 0, v: 0,
    })).toBe(makeSlotId(24));
  });

  it('reports cube slot ranges', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3, 4]));

    expect(engine.getCubeSlotRange(makeCubeId(0))).toEqual({
      start: makeSlotId(0), endExclusive: 54, count: 54,
    });
    expect(engine.getCubeSlotRange(makeCubeId(1))).toEqual({
      start: makeSlotId(54), endExclusive: 150, count: 96,
    });
  });

  it('throws for out-of-bounds coordinates', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));

    expect(() => engine.coordinateToSlotId({
      cubeId: makeCubeId(0), faceId: FaceId.FRONT, u: 3, v: 0,
    })).toThrowError(/Coordinate u=3 out of bounds/);

    expect(() => engine.coordinateToSlotId({
      cubeId: makeCubeId(0), faceId: FaceId.FRONT, u: 0, v: -1,
    })).toThrowError(/Coordinate v=-1 out of bounds/);
  });

  it('rejects fractional, NaN, and infinite coordinate indices', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));

    for (const invalid of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => engine.coordinateToSlotId({
        cubeId: makeCubeId(0), faceId: FaceId.FRONT, u: invalid, v: 0,
      })).toThrowError(/out of bounds/);
    }
  });

  it('rejects invalid face identifiers and unknown cube IDs', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));

    expect(() => engine.coordinateToSlotId({
      cubeId: makeCubeId(0), faceId: 6 as FaceId, u: 0, v: 0,
    })).toThrowError(/Invalid FaceId/);

    expect(() => engine.coordinateToSlotId({
      cubeId: makeCubeId(99), faceId: FaceId.UP, u: 0, v: 0,
    })).toThrowError(/Unknown CubeId/);
  });

  it('rejects invalid grid sizes', () => {
    for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => SlotIndexingEngine.createSpec([invalid])).toThrowError(/gridSize/);
    }
  });

  it('rejects duplicate IDs and total-slot overflow', () => {
    expect(() => createSystemSpec([
      { id: makeCubeId(5), gridSize: 1 },
      { id: makeCubeId(5), gridSize: 2 },
    ])).toThrowError(/Duplicate CubeId/);

    expect(() => SlotIndexingEngine.createSpec([40_000_000])).toThrowError(/safe integer/);
  });

  it('validates a caller-provided totalSlots field', () => {
    const validSpec = SlotIndexingEngine.createSpec([2]);
    const forgedSpec = { ...validSpec, totalSlots: validSpec.totalSlots + 1 };

    expect(() => new SlotIndexingEngine(forgedSpec)).toThrowError(/totalSlots mismatch/);
  });

  it('rejects invalid SlotIds including fractional IDs', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1]));

    expect(() => engine.slotIdToCoordinate(makeSlotId(-1))).toThrowError(/non-negative safe integer/);
    expect(() => engine.slotIdToCoordinate(makeSlotId(6))).toThrowError(/out of range/);
    expect(() => engine.slotIdToCoordinate(1.5 as ReturnType<typeof makeSlotId>)).toThrowError(/non-negative safe integer/);
  });

  it('supports an empty system as a valid zero-slot specification', () => {
    const spec = SlotIndexingEngine.createSpec([]);
    const engine = new SlotIndexingEngine(spec);

    expect(spec.totalSlots).toBe(0);
    expect([...engine.entries()]).toEqual([]);
    expect(() => engine.slotIdToCoordinate(makeSlotId(0))).toThrowError(/out of range/);
  });

  it('does not retain mutable caller-owned cube configuration objects', () => {
    const originalCube = { id: makeCubeId(4), gridSize: 2 };
    const spec = createSystemSpec([originalCube]);
    const engine = new SlotIndexingEngine(spec);

    // The factory snapshots/freeze-copies the original input.
    expect(Object.isFrozen(spec.cubes)).toBe(true);
    expect(Object.isFrozen(spec.cubes[0])).toBe(true);
    expect(engine.getCube(makeCubeId(4)).gridSize).toBe(2);
  });
});
