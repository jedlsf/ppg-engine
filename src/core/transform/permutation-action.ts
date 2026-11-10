
import { createPermutation, invertPermutation, isGlobalPermutation, Permutation, SlotIndexingEngine } from '../geometry/index.js';
import { PolynomialRingParameters, PolynomialState } from '../polynomial/index.js';
import {
  assertStateMatchesContext,
  createTransformationContext,
  type PolynomialStateTransformation,
} from './types.js';

/** Apply a Layer 1 global slot permutation to a Layer 2 polynomial state. */
export class PermutationAction implements PolynomialStateTransformation {
  public readonly kind = 'permutation' as const;
  public readonly name: string;
  public readonly systemKey: string;
  public readonly ringKey: string;
  public readonly ring: PolynomialRingParameters;
  public readonly permutation: Permutation;
  private readonly engine: SlotIndexingEngine;

  public constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    permutation: Permutation,
    name = 'slot-permutation',
  ) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new TypeError('name must be a non-empty string');
    }
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

  public apply(state: PolynomialState): PolynomialState {
    assertStateMatchesContext(state, this.systemKey, this.ringKey);
    return state.permute(this.permutation);
  }

  public inverse(): PermutationAction {
    return new PermutationAction(
      this.engine,
      this.ring,
      invertPermutation(this.permutation),
      `${this.name}^-1`,
    );
  }
}

export function createPermutationAction(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  permutation: Permutation,
  name?: string,
): PermutationAction {
  return new PermutationAction(engine, ring, permutation, name);
}
