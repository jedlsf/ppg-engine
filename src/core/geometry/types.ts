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

/**
 * Describe the face_ids API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export const FACE_IDS: readonly FaceId[] = Object.freeze([
  FaceId.UP,
  FaceId.DOWN,
  FaceId.LEFT,
  FaceId.RIGHT,
  FaceId.FRONT,
  FaceId.BACK,
]);

/**
 * Describe the face_count API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export const FACE_COUNT = 6 as const;

/** Maximum cube instances accepted by one geometry specification. */
export const MAX_SUPPORTED_CUBE_COUNT = 4_096;

/** Maximum face-grid edge length accepted for one cube. */
export const MAX_SUPPORTED_GRID_SIZE = 128;

/** Maximum facelet slots in one geometry system (resource-safety boundary). */
export const MAX_SUPPORTED_TOTAL_SLOTS = 100_000;

/**
 * Describe the cube config API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
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

/**
 * Create a validated non-negative cube identifier.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function makeCubeId(value: number): CubeId {
  assertNonNegativeSafeInteger(value, 'CubeId');
  return value as CubeId;
}

/**
 * Create a validated non-negative global slot identifier.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function makeSlotId(value: number): SlotId {
  assertNonNegativeSafeInteger(value, 'SlotId');
  return value as SlotId;
}

/**
 * Check whether a runtime value is one of the six canonical face identifiers.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function isFaceId(value: unknown): value is FaceId {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= FaceId.UP &&
    value <= FaceId.BACK
  );
}

/**
 * Require a non-negative JavaScript safe integer.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer; received ${String(value)}`);
  }
}

/**
 * Require a positive JavaScript safe integer.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer; received ${String(value)}`);
  }
}
