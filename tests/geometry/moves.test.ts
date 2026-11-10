import { describe, expect, it } from 'vitest';
import {
  applyPermutation,
  composePermutations,
  createFaceTurnPermutation,
  createSliceMovePermutation,
  FaceId,
  identityPermutation,
  invertPermutation,
  makeCubeId,
  SlotIndexingEngine,
  coordinateToSurfaceAddress,
} from  '../../src/core/geometry/index.js';
import type { Axis, QuarterTurnCount } from  '../../src/core/geometry/index.js';

const axes: readonly Axis[] = ['x', 'y', 'z'];
const turns: readonly QuarterTurnCount[] = [-2, -1, 1, 2];

function assertPermutationIsBijective(mapping: readonly number[], size: number): void {
  expect(mapping).toHaveLength(size);
  expect(new Set(mapping).size).toBe(size);
  for (const destination of mapping) {
    expect(Number.isSafeInteger(destination)).toBe(true);
    expect(destination).toBeGreaterThanOrEqual(0);
    expect(destination).toBeLessThan(size);
  }
}

describe('Layer 1: geometric slice moves', () => {
  it.each([1, 2, 3, 4, 7])('creates valid slice permutations for grid size %i', (n) => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([n]));
    for (const axis of axes) {
      for (let layer = 0; layer < n; layer += 1) {
        for (const quarterTurns of turns) {
          const permutation = createSliceMovePermutation(engine, {
            cubeId: makeCubeId(0), axis, layer, quarterTurns,
          });
          assertPermutationIsBijective(permutation.sourceToDestination, engine.spec.totalSlots);
        }
      }
    }
  });

  it('four positive quarter turns restore every slot', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    const quarterTurn = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'z', layer: 2, quarterTurns: 1,
    });
    let fourTurns = identityPermutation(engine.spec.totalSlots);
    for (let i = 0; i < 4; i += 1) {
      fourTurns = composePermutations(fourTurns, quarterTurn);
    }
    expect(fourTurns.sourceToDestination).toEqual(identityPermutation(engine.spec.totalSlots).sourceToDestination);
  });

  it('a move followed by its inverse is identity', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    const move = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 1, quarterTurns: 1,
    });
    const inverse = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 1, quarterTurns: -1,
    });
    expect(composePermutations(move, inverse).sourceToDestination).toEqual(
      identityPermutation(engine.spec.totalSlots).sourceToDestination,
    );
    expect(invertPermutation(move).sourceToDestination).toEqual(inverse.sourceToDestination);
  });

  it('a half-turn applied twice restores the state', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([4]));
    const halfTurn = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'y', layer: 3, quarterTurns: 2,
    });
    expect(composePermutations(halfTurn, halfTurn).sourceToDestination).toEqual(
      identityPermutation(engine.spec.totalSlots).sourceToDestination,
    );
  });

  it('leaves slots outside the chosen layer unchanged', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    const move = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 1, quarterTurns: 1,
    });
    for (const entry of engine.entries()) {
      const address = coordinateToSurfaceAddress(engine, entry.coordinate);
      if (address.position.x !== 1) {
        expect(move.sourceToDestination[Number(entry.slotId)]).toBe(entry.slotId);
      }
    }
  });

  it('does not change slots belonging to another cube instance', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3, 4]));
    const move = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'z', layer: 2, quarterTurns: 1,
    });
    const otherRange = engine.getCubeSlotRange(makeCubeId(1));
    for (let slot = Number(otherRange.start); slot < otherRange.endExclusive; slot += 1) {
      expect(move.sourceToDestination[slot]).toBe(slot);
    }
  });

  it('works for interior layers and changes the expected number of surface slots', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    const middleSlice = createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 1, quarterTurns: 1,
    });
    const changed = middleSlice.sourceToDestination.filter((destination, source) => destination !== source).length;
    // A middle slice of a 3x3 facelet surface model touches 4 strips of 3 slots.
    expect(changed).toBe(12);
  });

  it('rejects invalid axes, layers, and quarter-turn counts', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    expect(() => createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'a' as Axis, layer: 0, quarterTurns: 1,
    })).toThrowError(/Invalid move axis/);
    expect(() => createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 3, quarterTurns: 1,
    })).toThrowError(/out of bounds/);
    expect(() => createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 1.1, quarterTurns: 1,
    })).toThrowError(/out of bounds/);
    expect(() => createSliceMovePermutation(engine, {
      cubeId: makeCubeId(0), axis: 'x', layer: 1, quarterTurns: 0 as QuarterTurnCount,
    })).toThrowError(/quarterTurns/);
  });
});

describe('Layer 1: face turns', () => {
  it.each([FaceId.UP, FaceId.DOWN, FaceId.LEFT, FaceId.RIGHT, FaceId.FRONT, FaceId.BACK])(
    'creates a valid clockwise face-turn permutation for face %i',
    (faceId) => {
      const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
      const permutation = createFaceTurnPermutation(engine, {
        cubeId: makeCubeId(0), faceId, quarterTurns: 1,
      });
      assertPermutationIsBijective(permutation.sourceToDestination, engine.spec.totalSlots);
    },
  );

  it('each face quarter-turn has order four', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    for (const faceId of [FaceId.UP, FaceId.DOWN, FaceId.LEFT, FaceId.RIGHT, FaceId.FRONT, FaceId.BACK]) {
      const turn = createFaceTurnPermutation(engine, {
        cubeId: makeCubeId(0), faceId, quarterTurns: 1,
      });
      let repeated = identityPermutation(engine.spec.totalSlots);
      for (let i = 0; i < 4; i += 1) repeated = composePermutations(repeated, turn);
      expect(repeated.sourceToDestination).toEqual(identityPermutation(engine.spec.totalSlots).sourceToDestination);
    }
  });

  it('clockwise followed by counterclockwise restores arbitrary payload state', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    const clockwise = createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(0), faceId: FaceId.FRONT, quarterTurns: 1,
    });
    const counterclockwise = createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(0), faceId: FaceId.FRONT, quarterTurns: -1,
    });
    const original = Array.from({ length: engine.spec.totalSlots }, (_, index) => `slot-${index}`);
    const transformed = applyPermutation(applyPermutation(original, clockwise), counterclockwise);
    expect(transformed).toEqual(original);
  });

  it('rejects invalid face IDs and turn counts', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3]));
    expect(() => createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(0), faceId: 8 as FaceId, quarterTurns: 1,
    })).toThrowError(/Invalid FaceId/);
    expect(() => createFaceTurnPermutation(engine, {
      cubeId: makeCubeId(0), faceId: FaceId.FRONT, quarterTurns: 0 as QuarterTurnCount,
    })).toThrowError(/quarterTurns/);
  });
});
