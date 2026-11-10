import { FaceId, assertPositiveSafeInteger } from './types.js';
import type { CubeId } from './types.js';
import type { FaceNormal, GridPosition } from './surface.js';
import { faceForNormal, normalForFace } from './surface.js';

/** Integer coordinate of a unit-sized cube in the global spatial lattice. */
export interface LatticePosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

declare const cubeOrientationBrand: unique symbol;

/**
 * Index into CUBE_ORIENTATIONS. The 24 entries are proper cube rotations
 * (determinant +1); reflections are deliberately excluded.
 */
export type CubeOrientationId = number & {
  readonly [cubeOrientationBrand]: 'CubeOrientationId';
};

/**
 * Describe the matrix row API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export type MatrixRow = readonly [number, number, number];
/**
 * Describe the rotation matrix API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export type RotationMatrix = readonly [MatrixRow, MatrixRow, MatrixRow];

/**
 * Describe the cube orientation API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export interface CubeOrientation {
  readonly id: CubeOrientationId;
  readonly matrix: RotationMatrix;
}

/**
 * Describe the cube placement API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export interface CubePlacement {
  readonly cubeId: CubeId;
  /** Integer lattice cell occupied by this unit-sized cube. */
  readonly position: LatticePosition;
  /** One of the 24 proper cube rotations. */
  readonly orientation: CubeOrientationId;
}

const AXIS_PERMUTATIONS: readonly (readonly [number, number, number])[] = Object.freeze([
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
]);

function permutationSign(p: readonly number[]): 1 | -1 {
  let inversions = 0;
  for (let i = 0; i < p.length; i += 1) {
    for (let j = i + 1; j < p.length; j += 1) {
      if (p[i]! > p[j]!) inversions += 1;
    }
  }
  return inversions % 2 === 0 ? 1 : -1;
}

function matrixDeterminant(matrix: RotationMatrix): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

function buildRotationMatrices(): RotationMatrix[] {
  const matrices: RotationMatrix[] = [];
  for (const permutation of AXIS_PERMUTATIONS) {
    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const signs = [sx, sy, sz] as const;
          const determinant = permutationSign(permutation) * sx * sy * sz;
          if (determinant !== 1) continue;
          const rows: [number, number, number][] = [];
          for (let row = 0; row < 3; row += 1) {
            const values: [number, number, number] = [0, 0, 0];
            values[permutation[row]!] = signs[row]!;
            rows.push(values);
          }
          matrices.push(rows as unknown as RotationMatrix);
        }
      }
    }
  }

  const identityKey = '1,0,0,0,1,0,0,0,1';
  const key = (m: RotationMatrix) => m.flatMap((row) => [...row]).join(',');
  matrices.sort((a, b) => {
    const keyA = key(a);
    const keyB = key(b);
    if (keyA === keyB) return 0;
    if (keyA === identityKey) return -1;
    if (keyB === identityKey) return 1;
    return keyA.localeCompare(keyB);
  });

  if (matrices.length !== 24 || matrixDeterminant(matrices[0]!) !== 1 || key(matrices[0]!) !== identityKey) {
    throw new Error('Internal invariant failed while building cube orientations');
  }
  return matrices;
}

const ORIENTATION_MATRICES = buildRotationMatrices();

/** Immutable catalog of all 24 proper orientations; identity is orientation 0. */
export const CUBE_ORIENTATIONS: readonly CubeOrientation[] = Object.freeze(
  ORIENTATION_MATRICES.map((matrix, id) => Object.freeze({
    id: id as CubeOrientationId,
    matrix: Object.freeze(matrix.map((row) => Object.freeze([...row]) as unknown as MatrixRow)) as unknown as RotationMatrix,
  })),
);

/**
 * Describe the identity_orientation API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export const IDENTITY_ORIENTATION = CUBE_ORIENTATIONS[0]!.id;

/**
 * Create a validated index into the 24 proper cube orientations.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function makeCubeOrientationId(value: number): CubeOrientationId {
  if (!Number.isSafeInteger(value) || value < 0 || value >= CUBE_ORIENTATIONS.length) {
    throw new RangeError(`CubeOrientationId must be an integer in [0, 23]; received ${String(value)}`);
  }
  return value as CubeOrientationId;
}

/**
 * Check whether a runtime value identifies one of the 24 cube orientations.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function isCubeOrientationId(value: unknown): value is CubeOrientationId {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 24;
}

/**
 * Return an immutable proper cube orientation by identifier.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function getCubeOrientation(id: CubeOrientationId): CubeOrientation {
  if (!isCubeOrientationId(id)) {
    throw new RangeError(`Invalid CubeOrientationId: ${String(id)}`);
  }
  return CUBE_ORIENTATIONS[id]!;
}

function matrixKey(matrix: RotationMatrix): string {
  return matrix.flatMap((row) => [...row]).join(',');
}

/**
 * Compose cube orientations in execution order: apply `first`, then `second`.
 * The returned matrix is second.matrix * first.matrix.
 */
export function composeCubeOrientations(
  first: CubeOrientationId,
  second: CubeOrientationId,
): CubeOrientationId {
  const a = getCubeOrientation(first).matrix;
  const b = getCubeOrientation(second).matrix;
  const rows: [number, number, number][] = [];
  for (let row = 0; row < 3; row += 1) {
    const result: [number, number, number] = [0, 0, 0];
    for (let column = 0; column < 3; column += 1) {
      result[column] = b[row]![0] * a[0]![column]! + b[row]![1] * a[1]![column]! + b[row]![2] * a[2]![column]!;
    }
    rows.push(result);
  }
  const key = matrixKey(rows as unknown as RotationMatrix);
  const match = CUBE_ORIENTATIONS.find((orientation) => matrixKey(orientation.matrix) === key);
  if (!match) throw new Error('Internal invariant failed: composed orientation is not in the rotation catalog');
  return match.id;
}

/** Return the inverse orientation (the transpose of its orthogonal matrix). */
export function invertCubeOrientation(id: CubeOrientationId): CubeOrientationId {
  const matrix = getCubeOrientation(id).matrix;
  const transpose: [number, number, number][] = [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];
  const key = matrixKey(transpose as unknown as RotationMatrix);
  const match = CUBE_ORIENTATIONS.find((orientation) => matrixKey(orientation.matrix) === key);
  if (!match) throw new Error('Internal invariant failed: inverse orientation is not in the rotation catalog');
  return match.id;
}

function validatePosition(position: LatticePosition): void {
  if (position === null || typeof position !== 'object') {
    throw new TypeError('LatticePosition must be an object');
  }
  for (const [axis, value] of Object.entries({ x: position.x, y: position.y, z: position.z })) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`LatticePosition.${axis} must be a safe integer; received ${String(value)}`);
    }
  }
}

/** Return a validated, immutable copy of a lattice position. */
export function createLatticePosition(position: LatticePosition): LatticePosition {
  validatePosition(position);
  return Object.freeze({ x: position.x, y: position.y, z: position.z });
}

/** Apply an orientation matrix to an axis-aligned vector/normal. */
export function transformNormal(
  orientationId: CubeOrientationId,
  normal: FaceNormal,
): FaceNormal {
  // faceForNormal is also a runtime validation that normal is a valid unit axis normal.
  faceForNormal(normal);
  const matrix = getCubeOrientation(orientationId).matrix;
  const vector = [normal.x, normal.y, normal.z] as const;
  const result = matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
  return Object.freeze({
    x: result[0] as -1 | 0 | 1,
    y: result[1] as -1 | 0 | 1,
    z: result[2] as -1 | 0 | 1,
  });
}

/** Transform a local face identifier into its world-facing face normal. */
export function worldNormalForFace(
  orientationId: CubeOrientationId,
  faceId: FaceId,
): FaceNormal {
  return transformNormal(orientationId, normalForFace(faceId));
}

/** Find the local face whose outward normal points along the requested world normal. */
export function localFaceForWorldNormal(
  orientationId: CubeOrientationId,
  worldNormal: FaceNormal,
): FaceId {
  faceForNormal(worldNormal);
  for (const faceId of [FaceId.UP, FaceId.DOWN, FaceId.LEFT, FaceId.RIGHT, FaceId.FRONT, FaceId.BACK]) {
    const candidate = worldNormalForFace(orientationId, faceId);
    if (candidate.x === worldNormal.x && candidate.y === worldNormal.y && candidate.z === worldNormal.z) {
      return faceId;
    }
  }
  throw new Error('No local face maps to the requested world normal');
}

/**
 * Transform an integer surface-grid position under a cube orientation.
 * Negative matrix entries reflect one coordinate as N-1-coordinate, keeping
 * the output inside the same [0, N-1]^3 local indexing domain.
 */
export function transformGridPosition(
  orientationId: CubeOrientationId,
  position: GridPosition,
  gridSize: number,
): GridPosition {
  assertPositiveSafeInteger(gridSize, 'gridSize');
  if (position === null || typeof position !== 'object') {
    throw new TypeError('GridPosition must be an object');
  }
  const last = gridSize - 1;
  for (const [axis, value] of Object.entries({ x: position.x, y: position.y, z: position.z })) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= gridSize) {
      throw new RangeError(`GridPosition.${axis} must be an integer in [0, ${last}]; received ${String(value)}`);
    }
  }

  const matrix = getCubeOrientation(orientationId).matrix;
  const source = [position.x, position.y, position.z] as const;
  const result: number[] = [];
  for (const row of matrix) {
    const nonZeroColumn = row.findIndex((value) => value !== 0);
    const coefficient = row[nonZeroColumn]!;
    const value = source[nonZeroColumn]!;
    result.push(coefficient === 1 ? value : last - value);
  }
  return Object.freeze({ x: result[0]!, y: result[1]!, z: result[2]! });
}

/** Return the determinant for diagnostics/tests; valid orientations must return +1. */
export function orientationDeterminant(id: CubeOrientationId): number {
  return matrixDeterminant(getCubeOrientation(id).matrix);
}
