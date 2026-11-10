/**
 * Runtime and type-level primitives for Layer 1 (geometry).
 *
 * Slot indexing convention:
 *   1. Cubes are ordered by their position in SystemSpec.cubes.
 *   2. Within each cube, faces follow FaceId numeric order.
 *   3. Within a face, u is the row and v is the column.
 *   4. The local face index is u * gridSize + v.
 *
 * These types describe a polynomial-valued facelet model inspired by a Rubik's
 * Cube. They do not, by themselves, enforce the mechanical constraints of a
 * physical Rubik's Cube (corner/edge piece coupling, orientation constraints,
 * etc.).
 */

declare const cubeIdBrand: unique symbol;
declare const slotIdBrand: unique symbol;

/** A non-negative, safe-integer identifier for a cube instance. */
export type CubeId = number & { readonly [cubeIdBrand]: 'CubeId' };

/** A non-negative, safe-integer linear index into the complete slot space. */
export type SlotId = number & { readonly [slotIdBrand]: 'SlotId' };

/** Face identifiers and their canonical numeric order. */
export enum FaceId {
  UP = 0,
  DOWN = 1,
  LEFT = 2,
  RIGHT = 3,
  FRONT = 4,
  BACK = 5,
}

export const FACE_IDS: readonly FaceId[] = Object.freeze([
  FaceId.UP,
  FaceId.DOWN,
  FaceId.LEFT,
  FaceId.RIGHT,
  FaceId.FRONT,
  FaceId.BACK,
]);

export const FACE_COUNT = 6 as const;

export interface CubeConfig {
  /** Unique within one SystemSpec. Need not be contiguous or ordered. */
  readonly id: CubeId;
  /** Number of face slots along one edge; must be a positive safe integer. */
  readonly gridSize: number;
}

/**
 * Immutable, validated system configuration.
 *
 * totalSlots is derived from cubes and checked by SlotIndexingEngine. Avoid
 * constructing this object manually when possible; use createSystemSpec().
 */
export interface SystemSpec {
  readonly cubes: readonly CubeConfig[];
  readonly totalSlots: number;
}

/** A facelet address in a specific cube instance. */
export interface Coordinate {
  readonly cubeId: CubeId;
  readonly faceId: FaceId;
  /** Row index, 0 <= u < gridSize. */
  readonly u: number;
  /** Column index, 0 <= v < gridSize. */
  readonly v: number;
}

/** Half-open linear range occupied by one cube. */
export interface SlotRange {
  readonly start: SlotId;
  /** Exclusive end; can equal spec.totalSlots and is therefore a plain number. */
  readonly endExclusive: number;
  readonly count: number;
}

export function makeCubeId(value: number): CubeId {
  assertNonNegativeSafeInteger(value, 'CubeId');
  return value as CubeId;
}

export function makeSlotId(value: number): SlotId {
  assertNonNegativeSafeInteger(value, 'SlotId');
  return value as SlotId;
}

export function isFaceId(value: unknown): value is FaceId {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= FaceId.UP &&
    value <= FaceId.BACK
  );
}

export function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer; received ${String(value)}`);
  }
}

export function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer; received ${String(value)}`);
  }
}
