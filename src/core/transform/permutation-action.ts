
import { createPermutation, invertPermutation, isGlobalPermutation, Permutation, SlotIndexingEngine } from '../geometry/index.js';
import { PolynomialRingParameters, PolynomialState } from '../polynomial/index.js';
import {
  assertStateMatchesContext,
  createTransformationContext,
  type PolynomialStateTransformation,
  validateTransformationName,
} from './types.js';

/** Apply a Layer 1 global slot permutation to a Layer 2 polynomial state. */
export class PermutationAction implements PolynomialStateTransformation {
  /**
   * Identifies this transformation as a Layer 1 global slot permutation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly kind = 'permutation' as const;
  /**
   * History-safe label for diagnostics and composed transformation reporting.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly name: string;
  /**
   * Structural geometry key to which this permutation action is bound.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly systemKey: string;
  /**
   * Structural polynomial-ring key to which this permutation action is bound.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ringKey: string;
  /**
   * Normalized ring of the polynomial state on which the permutation acts.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ring: PolynomialRingParameters;
  /**
   * Detached, validated immutable permutation mapping source slots to destination slots.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly permutation: Permutation;
  private readonly engine: SlotIndexingEngine;

  /**
   * Bind a validated global permutation to one geometry/ring context.
   *
   * @param engine Geometry indexer defining the complete slot space.
   * @param ring Polynomial ring shared by the state being transformed.
   * @param permutation Bijection over every global slot in the supplied geometry.
   * @param name Optional validated history label.
   * @throws {TypeError} If the label or permutation shape is malformed.
   * @throws {RangeError} If the permutation does not cover the engine's global slot space.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    permutation: Permutation,
    name = 'slot-permutation',
  ) {
    validateTransformationName(name);
    if (!isGlobalPermutation(engine, permutation)) {
      throw new RangeError(`Permutation must cover all ${engine.spec.totalSlots} global slots`);
    }
    const context = createTransformationContext(engine, ring);
    this.engine = engine;
    this.ring = context.ring;
    this.systemKey = context.systemKey;
    this.ringKey = context.ringKey;
    this.name = name;
    // Rebuild through the validating factory to detach from caller-owned arrays.
    this.permutation = createPermutation(permutation.sourceToDestination.map(Number));
    Object.freeze(this);
  }

  /**
   * Apply the ordered transformation steps to a compatible polynomial state.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public apply(state: PolynomialState): PolynomialState {
    assertStateMatchesContext(state, this.systemKey, this.ringKey);
    return state.permute(this.permutation);
  }

  /**
   * Construct the inverse sequence by reversing and inverting every step.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public inverse(): PermutationAction {
    return new PermutationAction(
      this.engine,
      this.ring,
      invertPermutation(this.permutation),
      `${this.name}^-1`,
    );
  }
}

/**
 * Create a validated state transformation from a global permutation.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function createPermutationAction(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  permutation: Permutation,
  name?: string,
): PermutationAction {
  return new PermutationAction(engine, ring, permutation, name);
}
