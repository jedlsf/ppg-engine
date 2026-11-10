
import { SlotIndexingEngine } from '../geometry/index.js';
import { normalizeRingParameters, PolynomialRingParameters, PolynomialState } from '../polynomial/index.js';
import {
  assertStateMatchesContext,
  assertTransformationCompatible,
  createTransformationContext,
  type PolynomialStateTransformation,
  type TransformationContext,
} from './types.js';

/** A reversible ordered sequence; steps execute from first to last. */
export class TransformationSequence implements PolynomialStateTransformation {
  public readonly kind = 'sequence' as const;
  public readonly name: string;
  public readonly systemKey: string;
  public readonly ringKey: string;
  public readonly ring: PolynomialRingParameters;
  public readonly steps: readonly PolynomialStateTransformation[];
  private readonly engine: SlotIndexingEngine;

  public constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    steps: readonly PolynomialStateTransformation[],
    name = 'transformation-sequence',
  ) {
    if (!Array.isArray(steps)) throw new TypeError('steps must be an array');
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new TypeError('name must be a non-empty string');
    }
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

  public apply(state: PolynomialState): PolynomialState {
    assertStateMatchesContext(state, this.systemKey, this.ringKey);
    let current = state;
    for (const step of this.steps) current = step.apply(current);
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

export function composeTransformations(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  steps: readonly PolynomialStateTransformation[],
  name?: string,
): TransformationSequence {
  return new TransformationSequence(engine, ring, steps, name);
}

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
  const context: TransformationContext = createTransformationContext(state.engine, state.ring);
  let current = state;
  for (const [index, transformation] of transformations.entries()) {
    try {
      assertTransformationCompatible(transformation, context);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new RangeError(`Invalid transformation at index ${index}: ${detail}`);
    }
    current = transformation.apply(current);
  }
  return current;
}
