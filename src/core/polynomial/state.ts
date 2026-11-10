import {
  applyGlobalPermutation,
  isGlobalPermutation,
} from '../geometry/global-moves.js';
import { SlotIndexingEngine } from '../geometry/indexing.js';
import type { Permutation } from '../geometry/permutation.js';
import { makeSlotId, type SlotId, type Coordinate } from '../geometry/types.js';
import { Polynomial } from './polynomial.js';
import { normalizeRingParameters, sameRing, MAX_SUPPORTED_STATE_COEFFICIENTS, type PolynomialRingParameters } from './parameters.js';

/**
 * Callback that creates one polynomial value for each canonical slot and receives its coordinate.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export type PolynomialInitializer = (slotId: SlotId, coordinate: Coordinate) => Polynomial;

/**
 * Immutable dense polynomial payload indexed by the Layer 1 canonical SlotId.
 * Geometry remains payload-agnostic; this adapter is Layer 2's integration point.
 */
export class PolynomialState {
  /**
   * Geometry indexer that defines this state's canonical global slot IDs.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly engine: SlotIndexingEngine;
  /**
   * Normalized polynomial ring shared by every value in this state.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ring: PolynomialRingParameters;
  /**
   * Frozen dense array of polynomial payloads, indexed by global SlotId.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly values: readonly Polynomial[];

  private constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    values: readonly Polynomial[],
  ) {
    assertStateCapacity(engine, ring);
    this.engine = engine;
    this.ring = normalizeRingParameters(ring);
    this.values = Object.freeze([...values]);
    Object.freeze(this);
  }

  /**
   * Construct the zero polynomial for a validated ring.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public static zero(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
  ): PolynomialState {
    assertStateCapacity(engine, ring);
    const normalizedRing = normalizeRingParameters(ring);
    const zero = Polynomial.zero(normalizedRing);
    return new PolynomialState(
      engine,
      normalizedRing,
      Array<Polynomial>(engine.spec.totalSlots).fill(zero),
    );
  }

  /**
   * Create a state from a dense array of ring-compatible polynomial values.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public static fromValues(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    values: readonly Polynomial[],
  ): PolynomialState {
    assertStateCapacity(engine, ring);
    const normalizedRing = normalizeRingParameters(ring);
    if (!Array.isArray(values)) {
      throw new TypeError('values must be an array of Polynomial instances');
    }
    if (values.length !== engine.spec.totalSlots) {
      throw new RangeError(
        `Expected ${engine.spec.totalSlots} polynomial values; received ${values.length}`,
      );
    }
    for (let index = 0; index < values.length; index += 1) {
      // Index-based access also rejects sparse arrays, which Array#forEach skips.
      if (!Object.hasOwn(values, index)) throw new TypeError(`State value at slot ${index} is not a Polynomial; values are sparse at slot ${index}`);
      const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
      if (!descriptor || !('value' in descriptor)) throw new TypeError(`State value at slot ${index} must be a data property`);
      const value = descriptor.value;
      if (!(value instanceof Polynomial)) {
        throw new TypeError(`State value at slot ${index} is not a Polynomial`);
      }
      if (!sameRing(value.ring, normalizedRing)) {
        throw new RangeError(`State value at slot ${index} uses incompatible ring parameters`);
      }
    }
    return new PolynomialState(engine, normalizedRing, values);
  }

  /**
   * Create a state by invoking a caller initializer once for each canonical slot.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public static fromInitializer(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    initializer: PolynomialInitializer,
  ): PolynomialState {
    if (typeof initializer !== 'function') {
      throw new TypeError('initializer must be a function');
    }
    assertStateCapacity(engine, ring);
    const normalizedRing = normalizeRingParameters(ring);
    const values = Array<Polynomial>(engine.spec.totalSlots);
    for (const entry of engine.entries()) {
      const value = initializer(entry.slotId, entry.coordinate);
      if (!(value instanceof Polynomial)) {
        throw new TypeError(`Initializer returned a non-Polynomial for slot ${entry.slotId}`);
      }
      if (!sameRing(value.ring, normalizedRing)) {
        throw new RangeError(`Initializer returned an incompatible polynomial for slot ${entry.slotId}`);
      }
      values[Number(entry.slotId)] = value;
    }
    return new PolynomialState(engine, normalizedRing, values);
  }

  /**
   * Return the polynomial stored at a validated global slot identifier.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public get(slotId: SlotId): Polynomial {
    const index = this.validateSlotId(slotId);
    return this.values[index]!;
  }

  /** Persistent update: returns a new state and does not mutate this state. */
  public withValue(slotId: SlotId, value: Polynomial): PolynomialState {
    const index = this.validateSlotId(slotId);
    if (!(value instanceof Polynomial)) {
      throw new TypeError('value must be a Polynomial');
    }
    if (!sameRing(value.ring, this.ring)) {
      throw new RangeError('Polynomial ring parameters do not match the state');
    }
    const next = [...this.values];
    next[index] = value;
    return new PolynomialState(this.engine, this.ring, next);
  }

  /** Apply a Layer 1 source-to-destination permutation to all payloads. */
  public permute(permutation: Permutation): PolynomialState {
    if (!isGlobalPermutation(this.engine, permutation)) {
      throw new RangeError(
        `Permutation must be a valid global permutation of size ${this.engine.spec.totalSlots}`,
      );
    }
    const permuted = applyGlobalPermutation(this.engine, this.values, permutation);
    return PolynomialState.fromValues(this.engine, this.ring, permuted);
  }

  /**
   * Return a new state produced by mapping every polynomial value.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public mapValues(mapper: (
    slotId: SlotId,
    coordinate: Coordinate,
    current: Polynomial,
  ) => Polynomial): PolynomialState {
    if (typeof mapper !== 'function') {
      throw new TypeError('mapper must be a function');
    }
    const next = Array<Polynomial>(this.engine.spec.totalSlots);
    for (const entry of this.engine.entries()) {
      const current = this.values[Number(entry.slotId)]!;
      const value = mapper(entry.slotId, entry.coordinate, current);
      if (!(value instanceof Polynomial)) {
        throw new TypeError(`Mapper returned a non-Polynomial for slot ${entry.slotId}`);
      }
      if (!sameRing(value.ring, this.ring)) {
        throw new RangeError(`Mapper returned an incompatible polynomial for slot ${entry.slotId}`);
      }
      next[Number(entry.slotId)] = value;
    }
    return new PolynomialState(this.engine, this.ring, next);
  }

  /**
   * Compare complete geometry, ring, and polynomial-state contents.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public equals(other: PolynomialState): boolean {
    if (!(other instanceof PolynomialState) || !sameRing(this.ring, other.ring)) {
      return false;
    }
    if (!sameSystemSpec(this.engine, other.engine) || this.values.length !== other.values.length) {
      return false;
    }
    return this.values.every((value, index) => value.equals(other.values[index]!));
  }

  private validateSlotId(slotId: SlotId): number {
    if (typeof slotId !== 'number') {
      throw new RangeError(`Invalid SlotId: ${String(slotId)}`);
    }
    const index = slotId as number;
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.engine.spec.totalSlots) {
      throw new RangeError(`Invalid SlotId: ${String(slotId)}`);
    }
    // Reuse the Layer 1 validator, also ensuring the slot belongs to this spec.
    this.engine.slotIdToCoordinate(makeSlotId(index));
    return index;
  }
}

function sameSystemSpec(left: SlotIndexingEngine, right: SlotIndexingEngine): boolean {
  if (left.spec.totalSlots !== right.spec.totalSlots || left.spec.cubes.length !== right.spec.cubes.length) {
    return false;
  }
  return left.spec.cubes.every((cube, index) => {
    const other = right.spec.cubes[index];
    return other !== undefined && cube.id === other.id && cube.gridSize === other.gridSize;
  });
}


/**
 * Reject incompatible engine objects and state sizes before allocating dense
 * polynomial arrays.
 */
function assertStateCapacity(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
): void {
  if (!(engine instanceof SlotIndexingEngine)) {
    throw new TypeError('A valid SlotIndexingEngine instance is required');
  }
  const normalizedRing = normalizeRingParameters(ring);
  const coefficientCount = engine.spec.totalSlots * normalizedRing.degree;
  if (!Number.isSafeInteger(coefficientCount) || coefficientCount > MAX_SUPPORTED_STATE_COEFFICIENTS) {
    throw new RangeError(
      `Polynomial state requires ${coefficientCount} coefficients; the supported limit is ${MAX_SUPPORTED_STATE_COEFFICIENTS}`,
    );
  }
}
