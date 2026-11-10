
import { makeSlotId, SlotId, SlotIndexingEngine } from '../geometry/index.js';
import { normalizeRingParameters, Polynomial, PolynomialRingParameters, PolynomialState, sameRing } from '../polynomial/index.js';
import {
  assertStateMatchesContext,
  createTransformationContext,
  type PolynomialStateTransformation,
  validateTransformationName,
} from './types.js';

/**
 * An invertible elementary shear on two distinct state slots:
 *   target' = target + coefficient * source
 *   source' = source
 * Its inverse subtracts the same product. Coefficient need not be a unit.
 */
export class PolynomialCoupling implements PolynomialStateTransformation {
  /**
   * Provide the kind operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly kind = 'coupling' as const;
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
   * Provide the source slot operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly sourceSlot: SlotId;
  /**
   * Provide the target slot operation.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly targetSlot: SlotId;
  /**
   * Return one coefficient by its ascending-degree index.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly coefficient: Polynomial;
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
    sourceSlot: SlotId,
    targetSlot: SlotId,
    coefficient: Polynomial,
    name = 'polynomial-coupling',
  ) {
    const context = createTransformationContext(engine, ring);
    validateTransformationName(name);
    const source = validateSlot(engine, sourceSlot, 'sourceSlot');
    const target = validateSlot(engine, targetSlot, 'targetSlot');
    if (source === target) {
      throw new RangeError('sourceSlot and targetSlot must be distinct for an invertible shear');
    }
    if (!(coefficient instanceof Polynomial)) {
      throw new TypeError('coefficient must be a Polynomial');
    }
    if (!sameRing(coefficient.ring, context.ring)) {
      throw new RangeError('Coupling coefficient uses incompatible ring parameters');
    }

    this.engine = engine;
    this.ring = normalizeRingParameters(context.ring);
    this.systemKey = context.systemKey;
    this.ringKey = context.ringKey;
    this.sourceSlot = source;
    this.targetSlot = target;
    this.coefficient = coefficient;
    this.name = name;
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
    const source = state.get(this.sourceSlot);
    const target = state.get(this.targetSlot);
    const updatedTarget = target.add(this.coefficient.multiply(source));
    return state.withValue(this.targetSlot, updatedTarget);
  }

  /**
   * Construct the inverse sequence by reversing and inverting every step.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public inverse(): PolynomialCoupling {
    return new PolynomialCoupling(
      this.engine,
      this.ring,
      this.sourceSlot,
      this.targetSlot,
      this.coefficient.negate(),
      `${this.name}^-1`,
    );
  }
}

/**
 * Create a validated polynomial coupling transformation.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function createPolynomialCoupling(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  sourceSlot: SlotId,
  targetSlot: SlotId,
  coefficient: Polynomial,
  name?: string,
): PolynomialCoupling {
  return new PolynomialCoupling(engine, ring, sourceSlot, targetSlot, coefficient, name);
}

function validateSlot(engine: SlotIndexingEngine, slot: SlotId, label: string): SlotId {
  if (typeof slot !== 'number' || !Number.isSafeInteger(slot) || slot < 0 || slot >= engine.spec.totalSlots) {
    throw new RangeError(`${label} must be a valid SlotId in [0, ${engine.spec.totalSlots - 1}]`);
  }
  // Re-run Layer 1's canonical validator in case a branded ID was forged.
  engine.slotIdToCoordinate(makeSlotId(slot));
  return makeSlotId(slot);
}
