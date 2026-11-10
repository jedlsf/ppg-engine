
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
   * Provide the kind operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly kind = 'permutation' as const;
  /**
   * Provide the name operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly name: string;
  /**
   * Provide the system key operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly systemKey: string;
  /**
   * Provide the ring key operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ringKey: string;
  /**
   * Provide the ring operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ring: PolynomialRingParameters;
  /**
   * Provide the permutation operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly permutation: Permutation;
  private readonly engine: SlotIndexingEngine;

  /**
   * function Object() { [native code] }
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
