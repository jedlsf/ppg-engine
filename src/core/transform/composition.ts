
import { SlotIndexingEngine } from '../geometry/index.js';
import { normalizeRingParameters, PolynomialRingParameters, PolynomialState } from '../polynomial/index.js';
import {
  assertStateMatchesContext,
  assertTransformationCompatible,
  createTransformationContext,
  type PolynomialStateTransformation,
  type TransformationContext,
  MAX_SUPPORTED_TRANSFORMATION_STEPS,
  validateTransformationName,
} from './types.js';

/** A reversible ordered sequence; steps execute from first to last. */
export class TransformationSequence implements PolynomialStateTransformation {
  /**
   * Identifies this object as an ordered transformation sequence.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly kind = 'sequence' as const;
  /**
   * Human-readable, history-safe label for this sequence.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly name: string;
  /**
   * Structural key of the exact ordered geometry specification accepted by this sequence.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly systemKey: string;
  /**
   * Structural key of the polynomial ring accepted by this sequence.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ringKey: string;
  /**
   * Normalized polynomial ring used by every step in the sequence.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ring: PolynomialRingParameters;
  /**
   * Frozen list of transformations, executed from first to last.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly steps: readonly PolynomialStateTransformation[];
  private readonly engine: SlotIndexingEngine;

  /**
   * Create a bounded, immutable sequence after validating every step against the same geometry and ring.
   *
   * @param engine Geometry indexer that defines the canonical slot space.
   * @param ring Polynomial quotient-ring parameters shared by every step.
   * @param steps Ordered transformations to execute; the list is copied and frozen.
   * @param name Optional label retained in diagnostics and engine history.
   * @throws {TypeError} If the inputs or any transformation contract is malformed.
   * @throws {RangeError} If a step is incompatible or the sequence exceeds its configured limit.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    steps: readonly PolynomialStateTransformation[],
    name = 'transformation-sequence',
  ) {
    if (!Array.isArray(steps)) throw new TypeError('steps must be an array');
    if (steps.length > MAX_SUPPORTED_TRANSFORMATION_STEPS) {
      throw new RangeError(`Transformation sequence exceeds the supported limit of ${MAX_SUPPORTED_TRANSFORMATION_STEPS}`);
    }
    validateTransformationName(name);
    const context = createTransformationContext(engine, ring);
    for (const [index, step] of steps.entries()) {
      try {
        assertTransformationCompatible(step, context);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new RangeError(`Invalid transformation at step ${index}: ${detail}`);
      }
    }
    this.engine = engine;
    this.ring = normalizeRingParameters(context.ring);
    this.systemKey = context.systemKey;
    this.ringKey = context.ringKey;
    this.name = name;
    this.steps = Object.freeze([...steps]);
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
    let current = state;
    for (const step of this.steps) {
      const next = step.apply(current);
      assertStateMatchesContext(next, this.systemKey, this.ringKey);
      current = next;
    }
    return current;
  }

  /** Invert a composition by reversing step order and inverting each step. */
  public inverse(): TransformationSequence {
    return new TransformationSequence(
      this.engine,
      this.ring,
      this.steps.slice().reverse().map((step) => step.inverse()),
      `${this.name}^-1`,
    );
  }
}

/**
 * Create a validated ordered transformation sequence.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function composeTransformations(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  steps: readonly PolynomialStateTransformation[],
  name?: string,
): TransformationSequence {
  return new TransformationSequence(engine, ring, steps, name);
}

/**
 * Create a no-op sequence bound to one geometry and ring.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function identityTransformation(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  name = 'identity',
): TransformationSequence {
  return new TransformationSequence(engine, ring, [], name);
}

/** Apply a sequence without explicitly constructing a sequence wrapper. */
export function applyTransformations(
  state: PolynomialState,
  transformations: readonly PolynomialStateTransformation[],
): PolynomialState {
  if (!Array.isArray(transformations)) throw new TypeError('transformations must be an array');
  if (transformations.length > MAX_SUPPORTED_TRANSFORMATION_STEPS) throw new RangeError('Transformation count exceeds the supported limit');
  const context: TransformationContext = createTransformationContext(state.engine, state.ring);
  let current = state;
  for (let index = 0; index < transformations.length; index += 1) {
    if (!Object.hasOwn(transformations, index)) throw new TypeError(`Transformation at index ${index} is missing`);
    const transformation = transformations[index]!;
    try {
      assertTransformationCompatible(transformation, context);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new RangeError(`Invalid transformation at index ${index}: ${detail}`);
    }
    const next = transformation.apply(current);
    assertStateMatchesContext(next, context.systemKey, context.ringKey);
    current = next;
  }
  return current;
}
