import {
  assertNonNegativeSafeInteger,
  assertPositiveSafeInteger,
  CubeConfig,
  CubeId,
  Coordinate,
  FACE_COUNT,
  FACE_IDS,
  FaceId,
  isFaceId,
  makeCubeId,
  makeSlotId,
  MAX_SUPPORTED_CUBE_COUNT,
  MAX_SUPPORTED_GRID_SIZE,
  MAX_SUPPORTED_TOTAL_SLOTS,
  SlotId,
  SlotRange,
  SystemSpec,
} from './types.js';

interface CubeLayout {
  readonly cube: CubeConfig;
  readonly start: number;
  readonly endExclusive: number;
  readonly faceArea: number;
  readonly slotCount: number;
}

/**
 * Builds and freezes a canonical SystemSpec from cube configurations.
 *
 * Cube array order is significant: it determines each cube's global slot
 * offset. Cube IDs must be unique but do not need to be contiguous.
 */
export function createSystemSpec(cubes: readonly CubeConfig[]): SystemSpec {
  if (!Array.isArray(cubes)) {
    throw new TypeError('cubes must be an array');
  }

  if (cubes.length > MAX_SUPPORTED_CUBE_COUNT) {
    throw new RangeError(`Cube count exceeds the supported limit of ${MAX_SUPPORTED_CUBE_COUNT}; received ${cubes.length}`);
  }

  const seenIds = new Set<number>();
  const normalizedCubes: CubeConfig[] = [];
  let totalSlots = 0;

  for (const [index, inputCube] of cubes.entries()) {
    if (!Object.hasOwn(cubes, index)) throw new TypeError(`Cube configuration at index ${index} is missing`);
    if (inputCube === null || typeof inputCube !== 'object' || Array.isArray(inputCube)) {
      throw new TypeError(`Cube configuration at index ${index} must be an object`);
    }

    // Revalidate at runtime instead of trusting a TypeScript brand.
    const id = makeCubeId(inputCube.id as number);
    const gridSize = inputCube.gridSize;
    assertPositiveSafeInteger(gridSize, `gridSize for cube ${id}`);

    if (seenIds.has(id)) {
      throw new Error(`Duplicate CubeId: ${id}`);
    }
    seenIds.add(id);

    const faceArea = gridSize * gridSize;
    if (!Number.isSafeInteger(faceArea)) {
      throw new RangeError(`Face area overflows safe integer range for cube ${id}`);
    }

    const slotCount = FACE_COUNT * faceArea;
    if (!Number.isSafeInteger(slotCount)) {
      throw new RangeError(`Slot count overflows safe integer range for cube ${id}`);
    }

    if (gridSize > MAX_SUPPORTED_GRID_SIZE) throw new RangeError(`gridSize for cube ${id} exceeds the supported limit of ${MAX_SUPPORTED_GRID_SIZE}`);

    if (slotCount > MAX_SUPPORTED_TOTAL_SLOTS - totalSlots) {
      throw new RangeError(`Total slot count exceeds the supported limit of ${MAX_SUPPORTED_TOTAL_SLOTS}`);
    }
    totalSlots += slotCount;

    normalizedCubes.push(Object.freeze({ id, gridSize }));
  }

  return Object.freeze({
    cubes: Object.freeze(normalizedCubes),
    totalSlots,
  });
}

/**
 * Canonical bijection between coordinates (cubeId, faceId, u, v) and global
 * SlotId values in [0, totalSlots).
 *
 * Construction costs O(M), coordinateToSlotId is expected O(1), and
 * slotIdToCoordinate is O(log M), where M is the number of cube instances.
 */
export class SlotIndexingEngine {
  /**
   * Provide the spec operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly spec: SystemSpec;

  private readonly layouts: readonly CubeLayout[];
  private readonly layoutByCubeId: ReadonlyMap<CubeId, CubeLayout>;

  /**
   * function Object() { [native code] }
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public constructor(spec: SystemSpec) {
    if (spec === null || typeof spec !== 'object') {
      throw new TypeError('SystemSpec must be an object');
    }

    // Normalize and validate even if a caller bypassed createSystemSpec().
    const validated = createSystemSpec(spec.cubes);
    if (!Number.isSafeInteger(spec.totalSlots) || spec.totalSlots !== validated.totalSlots) {
      throw new Error(
        `SystemSpec.totalSlots mismatch: expected ${validated.totalSlots}, received ${String(spec.totalSlots)}`,
      );
    }
    this.spec = validated;

    const layouts: CubeLayout[] = [];
    const byId = new Map<CubeId, CubeLayout>();
    let start = 0;

    for (const cube of this.spec.cubes) {
      const faceArea = cube.gridSize * cube.gridSize;
      const slotCount = FACE_COUNT * faceArea;
      const layout: CubeLayout = Object.freeze({
        cube,
        start,
        endExclusive: start + slotCount,
        faceArea,
        slotCount,
      });
      layouts.push(layout);
      byId.set(cube.id, layout);
      start += slotCount;
    }

    this.layouts = Object.freeze(layouts);
    this.layoutByCubeId = byId;
  }

  /**
   * Convenience factory: gridSizes[i] creates cube ID i and sets its N_i.
   * Use createSystemSpec() when explicit, non-contiguous IDs are required.
   */
  public static createSpec(gridSizes: readonly number[]): SystemSpec {
    if (!Array.isArray(gridSizes)) {
      throw new TypeError('gridSizes must be an array');
    }

    if (gridSizes.length > MAX_SUPPORTED_CUBE_COUNT) throw new RangeError(`Cube count exceeds the supported limit of ${MAX_SUPPORTED_CUBE_COUNT}`);
    const cubes: CubeConfig[] = [];
    for (let index = 0; index < gridSizes.length; index += 1) {
      if (!Object.hasOwn(gridSizes, index)) throw new TypeError(`Grid size at index ${index} is missing`);
      cubes.push({ id: makeCubeId(index), gridSize: gridSizes[index]! });
    }
    return createSystemSpec(cubes);
  }

  /** Maps one valid facelet coordinate to its canonical global SlotId. */
  public coordinateToSlotId(coord: Coordinate): SlotId {
    if (coord === null || typeof coord !== 'object') {
      throw new TypeError('Coordinate must be an object');
    }

    // Validate runtime values, since callers can bypass TS types via JS, casts,
    // deserialization, or untyped inputs.
    try {
      assertNonNegativeSafeInteger(coord.cubeId as number, 'Coordinate.cubeId');
    } catch (error) {
      throw new RangeError(error instanceof Error ? error.message : 'Invalid Coordinate.cubeId');
    }

    const layout = this.layoutByCubeId.get(coord.cubeId);
    if (!layout) {
      throw new Error(`Unknown CubeId: ${String(coord.cubeId)}`);
    }

    if (!isFaceId(coord.faceId)) {
      throw new RangeError(`Invalid FaceId: ${String(coord.faceId)}`);
    }

    if (!Number.isSafeInteger(coord.u) || coord.u < 0 || coord.u >= layout.cube.gridSize) {
      throw new RangeError(
        `Coordinate u=${String(coord.u)} out of bounds for N_i=${layout.cube.gridSize}; expected an integer in [0, ${layout.cube.gridSize - 1}]`,
      );
    }

    if (!Number.isSafeInteger(coord.v) || coord.v < 0 || coord.v >= layout.cube.gridSize) {
      throw new RangeError(
        `Coordinate v=${String(coord.v)} out of bounds for N_i=${layout.cube.gridSize}; expected an integer in [0, ${layout.cube.gridSize - 1}]`,
      );
    }

    const localOffset = coord.faceId * layout.faceArea + coord.u * layout.cube.gridSize + coord.v;
    return makeSlotId(layout.start + localOffset);
  }

  /**
   * Inverse mapping from a valid SlotId to the canonical facelet coordinate.
   * Uses binary search over cube ranges.
   */
  public slotIdToCoordinate(slotId: SlotId): Coordinate {
    const rawSlot = slotId as number;
    assertNonNegativeSafeInteger(rawSlot, 'SlotId');

    if (rawSlot >= this.spec.totalSlots) {
      throw new RangeError(
        `SlotId ${rawSlot} out of range [0, ${this.spec.totalSlots - 1}]`,
      );
    }

    // Find the first cube range whose exclusive end is greater than the slot.
    let low = 0;
    let high = this.layouts.length - 1;
    let matched: CubeLayout | undefined;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const layout = this.layouts[mid]!;

      if (rawSlot < layout.start) {
        high = mid - 1;
      } else if (rawSlot >= layout.endExclusive) {
        low = mid + 1;
      } else {
        matched = layout;
        break;
      }
    }

    if (!matched) {
      // Should be unreachable if the validated spec and layout are consistent.
      throw new Error(`Internal indexing invariant failed for SlotId ${rawSlot}`);
    }

    const localOffset = rawSlot - matched.start;
    const faceIndex = Math.floor(localOffset / matched.faceArea);
    const faceOffset = localOffset % matched.faceArea;
    const u = Math.floor(faceOffset / matched.cube.gridSize);
    const v = faceOffset % matched.cube.gridSize;

    return Object.freeze({
      cubeId: matched.cube.id,
      faceId: faceIndex as FaceId,
      u,
      v,
    });
  }

  /** Return the immutable configuration for a cube ID. */
  public getCube(cubeId: CubeId): CubeConfig {
    assertNonNegativeSafeInteger(cubeId as number, 'CubeId');
    const layout = this.layoutByCubeId.get(cubeId);
    if (!layout) {
      throw new Error(`Unknown CubeId: ${String(cubeId)}`);
    }
    return layout.cube;
  }

  /** Return the half-open global slot range occupied by a cube. */
  public getCubeSlotRange(cubeId: CubeId): SlotRange {
    assertNonNegativeSafeInteger(cubeId as number, 'CubeId');
    const layout = this.layoutByCubeId.get(cubeId);
    if (!layout) {
      throw new Error(`Unknown CubeId: ${String(cubeId)}`);
    }

    return Object.freeze({
      start: makeSlotId(layout.start),
      endExclusive: layout.endExclusive,
      count: layout.slotCount,
    });
  }

  /**
   * Iterate every global slot and its coordinate in canonical order.
   * Lazy and O(D): does not allocate an array of size totalSlots or perform a
   * binary search for every slot.
   */
  public *entries(): Generator<Readonly<{ slotId: SlotId; coordinate: Coordinate }>> {
    for (const layout of this.layouts) {
      const n = layout.cube.gridSize;

      for (const faceId of FACE_IDS) {
        for (let u = 0; u < n; u += 1) {
          for (let v = 0; v < n; v += 1) {
            const rawSlot = layout.start + faceId * layout.faceArea + u * n + v;
            const coordinate: Coordinate = Object.freeze({
              cubeId: layout.cube.id,
              faceId,
              u,
              v,
            });
            yield Object.freeze({ slotId: makeSlotId(rawSlot), coordinate });
          }
        }
      }
    }
  }
}
