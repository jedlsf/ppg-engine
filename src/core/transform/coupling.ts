
import { makeSlotId, SlotId, SlotIndexingEngine } from '../geometry/index.js';
import { normalizeRingParameters, Polynomial, PolynomialRingParameters, PolynomialState, sameRing } from '../polynomial/index.js';
import {
  assertStateMatchesContext,
  createTransformationContext,
  type PolynomialStateTransformation,
} from './types.js';

/**
 * An invertible elementary shear on two distinct state slots:
 *   target' = target + coefficient * source
 *   source' = source
 * Its inverse subtracts the same product. Coefficient need not be a unit.
 */
export class PolynomialCoupling implements PolynomialStateTransformation {
  public readonly kind = 'coupling' as const;
  public readonly name: string;
  public readonly systemKey: string;
  public readonly ringKey: string;
  public readonly ring: PolynomialRingParameters;
  public readonly sourceSlot: SlotId;
  public readonly targetSlot: SlotId;
  public readonly coefficient: Polynomial;
  private readonly engine: SlotIndexingEngine;

  public constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    sourceSlot: SlotId,
    targetSlot: SlotId,
    coefficient: Polynomial,
    name = 'polynomial-coupling',
  ) {
    const context = createTransformationContext(engine, ring);
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new TypeError('name must be a non-empty string');
    }
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

  public apply(state: PolynomialState): PolynomialState {
    assertStateMatchesContext(state, this.systemKey, this.ringKey);
    const source = state.get(this.sourceSlot);
    const target = state.get(this.targetSlot);
    const updatedTarget = target.add(this.coefficient.multiply(source));
    return state.withValue(this.targetSlot, updatedTarget);
  }

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
