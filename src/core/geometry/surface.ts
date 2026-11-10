import type { Coordinate, CubeId, SlotId } from './types.js';
import { FaceId, isFaceId } from './types.js';
import type { SlotIndexingEngine } from './indexing.js';

/** Integer coordinates on the N x N x N grid of cubie positions. */
export interface GridPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A unit axis-aligned normal. Runtime functions validate that exactly one
 * component is +/-1 and the other two are zero.
 */
export interface FaceNormal {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  readonly z: -1 | 0 | 1;
}

/**
 * Geometric identity of one visible facelet: cube instance, surface position,
 * and outward normal. Positions alone are not unique at cube edges/corners.
 */
export interface SurfaceAddress {
  readonly cubeId: CubeId;
  readonly position: GridPosition;
  readonly normal: FaceNormal;
}

const NORMAL_BY_FACE: Readonly<Record<FaceId, FaceNormal>> = Object.freeze({
  [FaceId.UP]: Object.freeze({ x: 0, y: 1, z: 0 }),
  [FaceId.DOWN]: Object.freeze({ x: 0, y: -1, z: 0 }),
  [FaceId.LEFT]: Object.freeze({ x: -1, y: 0, z: 0 }),
  [FaceId.RIGHT]: Object.freeze({ x: 1, y: 0, z: 0 }),
  [FaceId.FRONT]: Object.freeze({ x: 0, y: 0, z: 1 }),
  [FaceId.BACK]: Object.freeze({ x: 0, y: 0, z: -1 }),
});

const FACE_BY_NORMAL_KEY: ReadonlyMap<string, FaceId> = new Map(
  Object.entries(NORMAL_BY_FACE).map(([face, normal]) => [normalKey(normal), Number(face) as FaceId]),
);

function normalKey(normal: Readonly<{ x: number; y: number; z: number }>): string {
  return `${normal.x},${normal.y},${normal.z}`;
}

function freezePosition(position: GridPosition): GridPosition {
  return Object.freeze({ x: position.x, y: position.y, z: position.z });
}

function freezeNormal(normal: FaceNormal): FaceNormal {
  return Object.freeze({ x: normal.x, y: normal.y, z: normal.z });
}

function makeAddress(cubeId: CubeId, position: GridPosition, normal: FaceNormal): SurfaceAddress {
  return Object.freeze({
    cubeId,
    position: freezePosition(position),
    normal: freezeNormal(normal),
  });
}

/** Return the fixed outward normal associated with a canonical face ID. */
export function normalForFace(faceId: FaceId): FaceNormal {
  if (!isFaceId(faceId)) throw new RangeError(`Invalid FaceId: ${String(faceId)}`);
  const normal = NORMAL_BY_FACE[faceId];
  if (!normal) {
    throw new RangeError(`Invalid FaceId: ${String(faceId)}`);
  }
  return normal;
}

/** Return the face corresponding to an exact axis-aligned unit normal. */
export function faceForNormal(normal: FaceNormal): FaceId {
  if (normal === null || typeof normal !== 'object') {
    throw new TypeError('Face normal must be an object');
  }
  for (const [axis, value] of Object.entries({ x: normal.x, y: normal.y, z: normal.z })) {
    if (typeof value !== 'number' || ![-1, 0, 1].includes(value)) {
      throw new RangeError(`Face normal component ${axis} must be -1, 0, or 1`);
    }
  }
  const nonZeroComponents = [normal.x, normal.y, normal.z].filter((value) => value !== 0).length;
  if (nonZeroComponents !== 1) throw new RangeError('Face normal must have exactly one non-zero component');
  const faceId = FACE_BY_NORMAL_KEY.get(normalKey(normal));
  if (faceId === undefined) {
    throw new RangeError(
      `Normal (${String(normal.x)}, ${String(normal.y)}, ${String(normal.z)}) is not an axis-aligned unit normal`,
    );
  }
  return faceId;
}

/**
 * Embed a canonical facelet coordinate into integer 3D surface coordinates.
 *
 * Coordinate convention:
 *   +x = RIGHT, +y = UP, +z = FRONT.
 *   Face-local u increases down the displayed face; v increases right.
 *
 * The local face orientations are chosen so that face-local right cross up is
 * the outward normal. This makes face-turn directions consistent across faces.
 */
export function coordinateToSurfaceAddress(
  engine: SlotIndexingEngine,
  coordinate: Coordinate,
): SurfaceAddress {
  // This call performs all runtime checks for cube ID, face ID, and u/v bounds.
  engine.coordinateToSlotId(coordinate);
  const { gridSize } = engine.getCube(coordinate.cubeId);
  const { faceId, u, v, cubeId } = coordinate;
  const last = gridSize - 1;

  let position: GridPosition;
  switch (faceId) {
    case FaceId.UP:
      position = { x: v, y: last, z: u };
      break;
    case FaceId.DOWN:
      position = { x: v, y: 0, z: last - u };
      break;
    case FaceId.LEFT:
      position = { x: 0, y: last - u, z: v };
      break;
    case FaceId.RIGHT:
      position = { x: last, y: last - u, z: last - v };
      break;
    case FaceId.FRONT:
      position = { x: v, y: last - u, z: last };
      break;
    case FaceId.BACK:
      position = { x: last - v, y: last - u, z: 0 };
      break;
    default: {
      // Runtime guard for untyped or deserialized callers.
      const unreachable: never = faceId;
      throw new RangeError(`Invalid FaceId: ${String(unreachable)}`);
    }
  }

  return makeAddress(cubeId, position, normalForFace(faceId));
}

/**
 * Reverse a geometric address into the canonical facelet coordinate.
 * The position must be in bounds and lie on the face plane indicated by its
 * outward normal. Edges/corners remain unambiguous because the normal is part
 * of the address.
 */
export function surfaceAddressToCoordinate(
  engine: SlotIndexingEngine,
  address: SurfaceAddress,
): Coordinate {
  if (address === null || typeof address !== 'object') {
    throw new TypeError('SurfaceAddress must be an object');
  }
  if (address.position === null || typeof address.position !== 'object') {
    throw new TypeError('SurfaceAddress.position must be an object');
  }

  const cube = engine.getCube(address.cubeId);
  const n = cube.gridSize;
  const last = n - 1;
  const { x, y, z } = address.position;

  for (const [name, value] of Object.entries({ x, y, z })) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= n) {
      throw new RangeError(
        `Surface position ${name}=${String(value)} out of bounds; expected an integer in [0, ${last}]`,
      );
    }
  }

  const faceId = faceForNormal(address.normal);
  let coordinate: Coordinate;

  switch (faceId) {
    case FaceId.UP:
      if (y !== last) throw new RangeError('Surface position does not lie on the UP face plane');
      coordinate = { cubeId: cube.id, faceId, u: z, v: x };
      break;
    case FaceId.DOWN:
      if (y !== 0) throw new RangeError('Surface position does not lie on the DOWN face plane');
      coordinate = { cubeId: cube.id, faceId, u: last - z, v: x };
      break;
    case FaceId.LEFT:
      if (x !== 0) throw new RangeError('Surface position does not lie on the LEFT face plane');
      coordinate = { cubeId: cube.id, faceId, u: last - y, v: z };
      break;
    case FaceId.RIGHT:
      if (x !== last) throw new RangeError('Surface position does not lie on the RIGHT face plane');
      coordinate = { cubeId: cube.id, faceId, u: last - y, v: last - z };
      break;
    case FaceId.FRONT:
      if (z !== last) throw new RangeError('Surface position does not lie on the FRONT face plane');
      coordinate = { cubeId: cube.id, faceId, u: last - y, v: x };
      break;
    case FaceId.BACK:
      if (z !== 0) throw new RangeError('Surface position does not lie on the BACK face plane');
      coordinate = { cubeId: cube.id, faceId, u: last - y, v: last - x };
      break;
    default: {
      const unreachable: never = faceId;
      throw new RangeError(`Invalid FaceId from normal: ${String(unreachable)}`);
    }
  }

  // Validate the reconstructed address against the canonical indexer.
  engine.coordinateToSlotId(coordinate);
  return Object.freeze(coordinate);
}

/** Convenience helper: map a surface address to its canonical global slot. */
export function surfaceAddressToSlotId(
  engine: SlotIndexingEngine,
  address: SurfaceAddress,
): SlotId {
  return engine.coordinateToSlotId(surfaceAddressToCoordinate(engine, address));
}
