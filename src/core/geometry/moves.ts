import type { Coordinate, CubeId } from './types.js';
import { FaceId } from './types.js';
import type { SlotIndexingEngine } from './indexing.js';
import {
  coordinateToSurfaceAddress,
  surfaceAddressToCoordinate,
  type FaceNormal,
  type GridPosition,
  type SurfaceAddress,
} from './surface.js';
import { createPermutation, type Permutation } from './permutation.js';

export const AXES = Object.freeze(['x', 'y', 'z'] as const);
export type Axis = (typeof AXES)[number];

/** Signed right-handed quarter turns around the positive world axis. */
export const QUARTER_TURN_COUNTS = Object.freeze([-2, -1, 1, 2] as const);
export type QuarterTurnCount = (typeof QUARTER_TURN_COUNTS)[number];

/** Slice layer index is the position coordinate along axis, in [0, N-1]. */
export interface SliceMove {
  readonly cubeId: CubeId;
  readonly axis: Axis;
  readonly layer: number;
  readonly quarterTurns: QuarterTurnCount;
}

/**
 * Face turn where positive quarterTurns means clockwise as viewed from
 * outside that face; negative means counterclockwise. +/-2 means half turn.
 */
export interface FaceTurnMove {
  readonly cubeId: CubeId;
  readonly faceId: FaceId;
  readonly quarterTurns: QuarterTurnCount;
}

function isAxis(value: unknown): value is Axis {
  return value === 'x' || value === 'y' || value === 'z';
}

function isQuarterTurnCount(value: unknown): value is QuarterTurnCount {
  return value === -2 || value === -1 || value === 1 || value === 2;
}

function axisCoordinate(position: GridPosition, axis: Axis): number {
  return position[axis];
}

function rotatePositionPositiveQuarterTurn(
  position: GridPosition,
  gridSize: number,
  axis: Axis,
): GridPosition {
  const last = gridSize - 1;
  switch (axis) {
    case 'x':
      return { x: position.x, y: last - position.z, z: position.y };
    case 'y':
      return { x: position.z, y: position.y, z: last - position.x };
    case 'z':
      return { x: last - position.y, y: position.x, z: position.z };
  }
}

function rotateNormalPositiveQuarterTurn(normal: FaceNormal, axis: Axis): FaceNormal {
  switch (axis) {
    case 'x':
      return { x: normal.x, y: -normal.z as -1 | 0 | 1, z: normal.y };
    case 'y':
      return { x: normal.z, y: normal.y, z: -normal.x as -1 | 0 | 1 };
    case 'z':
      return { x: -normal.y as -1 | 0 | 1, y: normal.x, z: normal.z };
  }
}

function rotateAddress(
  address: SurfaceAddress,
  gridSize: number,
  axis: Axis,
  quarterTurns: QuarterTurnCount,
): SurfaceAddress {
  // Convert negative quarter turns to equivalent positive turns in [0, 3].
  const positiveTurns = quarterTurns < 0 ? quarterTurns + 4 : quarterTurns;
  let position: GridPosition = address.position;
  let normal: FaceNormal = address.normal;

  for (let turn = 0; turn < positiveTurns; turn += 1) {
    position = rotatePositionPositiveQuarterTurn(position, gridSize, axis);
    normal = rotateNormalPositiveQuarterTurn(normal, axis);
  }

  return Object.freeze({
    cubeId: address.cubeId,
    position: Object.freeze(position),
    normal: Object.freeze(normal),
  });
}

function validateSliceMove(engine: SlotIndexingEngine, move: SliceMove): number {
  if (move === null || typeof move !== 'object') {
    throw new TypeError('SliceMove must be an object');
  }
  if (!isAxis(move.axis)) {
    throw new RangeError(`Invalid move axis: ${String(move.axis)}`);
  }
  if (!isQuarterTurnCount(move.quarterTurns)) {
    throw new RangeError(`quarterTurns must be one of -2, -1, 1, 2; received ${String(move.quarterTurns)}`);
  }

  const cube = engine.getCube(move.cubeId);
  if (!Number.isSafeInteger(move.layer) || move.layer < 0 || move.layer >= cube.gridSize) {
    throw new RangeError(
      `Layer ${String(move.layer)} out of bounds for cube ${String(move.cubeId)} with gridSize ${cube.gridSize}; expected an integer in [0, ${cube.gridSize - 1}]`,
    );
  }
  return cube.gridSize;
}

/**
 * Create a global slot permutation for a single slice rotation.
 * Facelets in the selected cube whose 3D position coordinate along `axis`
 * equals `layer` are rotated; all other global slots are unchanged.
 *
 * `quarterTurns` uses right-handed rotation around the positive world axis.
 * This models surface facelets, not all physical cubie reachability rules.
 */
export function createSliceMovePermutation(
  engine: SlotIndexingEngine,
  move: SliceMove,
): Permutation {
  const gridSize = validateSliceMove(engine, move);
  const mapping = Array.from({ length: engine.spec.totalSlots }, (_, index) => index);

  for (const entry of engine.entries()) {
    if (entry.coordinate.cubeId !== move.cubeId) continue;

    const address = coordinateToSurfaceAddress(engine, entry.coordinate);
    if (axisCoordinate(address.position, move.axis) !== move.layer) continue;

    const rotated = rotateAddress(address, gridSize, move.axis, move.quarterTurns);
    const destinationCoordinate: Coordinate = surfaceAddressToCoordinate(engine, rotated);
    const destinationSlot = engine.coordinateToSlotId(destinationCoordinate);
    mapping[Number(entry.slotId)] = Number(destinationSlot);
  }

  return createPermutation(mapping);
}

interface FaceTurnDefinition {
  readonly axis: Axis;
  readonly layerFromBoundary: 'min' | 'max';
  /** Sign of the face's outward normal along its rotation axis. */
  readonly outwardSign: 1 | -1;
}

const FACE_TURN_DEFINITIONS: Readonly<Record<FaceId, FaceTurnDefinition>> = Object.freeze({
  [FaceId.UP]: Object.freeze({ axis: 'y', layerFromBoundary: 'max', outwardSign: 1 }),
  [FaceId.DOWN]: Object.freeze({ axis: 'y', layerFromBoundary: 'min', outwardSign: -1 }),
  [FaceId.LEFT]: Object.freeze({ axis: 'x', layerFromBoundary: 'min', outwardSign: -1 }),
  [FaceId.RIGHT]: Object.freeze({ axis: 'x', layerFromBoundary: 'max', outwardSign: 1 }),
  [FaceId.FRONT]: Object.freeze({ axis: 'z', layerFromBoundary: 'max', outwardSign: 1 }),
  [FaceId.BACK]: Object.freeze({ axis: 'z', layerFromBoundary: 'min', outwardSign: -1 }),
});

/**
 * Create a face-turn permutation. Unlike SliceMove, this API defines positive
 * quarterTurns as clockwise when looking at the named face from outside.
 */
export function createFaceTurnPermutation(
  engine: SlotIndexingEngine,
  move: FaceTurnMove,
): Permutation {
  if (move === null || typeof move !== 'object') {
    throw new TypeError('FaceTurnMove must be an object');
  }
  const definition = FACE_TURN_DEFINITIONS[move.faceId];
  if (!definition) {
    throw new RangeError(`Invalid FaceId for face turn: ${String(move.faceId)}`);
  }
  if (!isQuarterTurnCount(move.quarterTurns)) {
    throw new RangeError(`quarterTurns must be one of -2, -1, 1, 2; received ${String(move.quarterTurns)}`);
  }

  const cube = engine.getCube(move.cubeId);
  const layer = definition.layerFromBoundary === 'min' ? 0 : cube.gridSize - 1;
  // Clockwise viewed from outside is a negative right-handed turn around the
  // outward normal. Convert that to the positive world-axis convention.
  const worldQuarterTurns = (move.quarterTurns * -definition.outwardSign) as QuarterTurnCount;

  return createSliceMovePermutation(engine, {
    cubeId: move.cubeId,
    axis: definition.axis,
    layer,
    quarterTurns: worldQuarterTurns,
  });
}
