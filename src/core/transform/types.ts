import { SlotIndexingEngine, systemSpecKey } from "../geometry/index.js";
import {
  normalizeRingParameters,
  PolynomialRingParameters,
  PolynomialState,
  ringParameterKey,
} from "../polynomial/index.js";

/** Hard cap on the number of transformations in one ordered sequence. */
export const MAX_SUPPORTED_TRANSFORMATION_STEPS = 10_000;

/** Hard cap on labels stored in engine history. */
export const MAX_TRANSFORMATION_NAME_LENGTH = 160;

/**
 * Describe the transformation kind API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export type TransformationKind =
  | "permutation"
  | "ring-automorphism"
  | "coupling"
  | "sequence";

/**
 * A reversible transformation bound to one ordered geometry specification and
 * one polynomial quotient ring. This is a research API, not a cryptographic
 * security abstraction.
 */
export interface PolynomialStateTransformation {
  readonly kind: TransformationKind;
  readonly name: string;
  readonly systemKey: string;
  readonly ringKey: string;
  apply(state: PolynomialState): PolynomialState;
  inverse(): PolynomialStateTransformation;
}

/**
 * Describe the transformation context API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export interface TransformationContext {
  readonly systemKey: string;
  readonly ringKey: string;
  readonly ring: PolynomialRingParameters;
}

/**
 * Bind a transformation to one geometry specification and one polynomial ring.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function createTransformationContext(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
): TransformationContext {
  if (!(engine instanceof SlotIndexingEngine)) {
    throw new TypeError("A valid SlotIndexingEngine is required");
  }
  const normalizedRing = normalizeRingParameters(ring);
  return Object.freeze({
    systemKey: systemSpecKey(engine),
    ringKey: ringParameterKey(normalizedRing),
    ring: normalizedRing,
  });
}

/**
 * Require a polynomial state to match a transformation's geometry and ring.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function assertStateMatchesContext(
  state: PolynomialState,
  systemKey: string,
  ringKey: string,
): void {
  if (!(state instanceof PolynomialState)) {
    throw new TypeError("state must be a PolynomialState");
  }
  if (systemSpecKey(state.engine) !== systemKey) {
    throw new RangeError(
      "PolynomialState uses a different ordered geometry SystemSpec",
    );
  }
  if (ringParameterKey(state.ring) !== ringKey) {
    throw new RangeError(
      "PolynomialState uses incompatible polynomial ring parameters",
    );
  }
}

/**
 * Validate a transformation contract before accepting it into a sequence.
 * This checks shape and compatibility; it cannot sandbox caller-provided code.
 */
export function assertTransformationCompatible(
  transformation: PolynomialStateTransformation,
  context: TransformationContext,
): void {
  if (transformation === null || typeof transformation !== "object") {
    throw new TypeError("Transformation must be an object");
  }
  validateTransformationName(transformation.name);
  if (!["permutation", "ring-automorphism", "coupling", "sequence"].includes(transformation.kind)) {
    throw new TypeError("Transformation kind is not supported");
  }
  if (transformation.systemKey !== context.systemKey) {
    throw new RangeError(
      `Transformation "${transformation.name}" uses a different geometry SystemSpec`,
    );
  }
  if (transformation.ringKey !== context.ringKey) {
    throw new RangeError(
      `Transformation "${transformation.name}" uses incompatible ring parameters`,
    );
  }
  if (
    typeof transformation.apply !== "function" ||
    typeof transformation.inverse !== "function"
  ) {
    throw new TypeError(
      `Transformation "${transformation.name}" must implement apply() and inverse()`,
    );
  }
}

/**
 * Validate a history-safe transformation label.
 *
 * @throws {TypeError} When the label is not a string.
 * @throws {RangeError} When it is empty, too long, or contains control characters.
 */
export function validateTransformationName(name: unknown): asserts name is string {
  if (typeof name !== "string") throw new TypeError("Transformation name must be a string");
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new RangeError("Transformation name must not contain control characters");
  }
  if (name.trim().length === 0) throw new RangeError("Transformation name must be non-empty");
  if (name.length > MAX_TRANSFORMATION_NAME_LENGTH) {
    throw new RangeError(`Transformation name exceeds ${MAX_TRANSFORMATION_NAME_LENGTH} characters`);
  }
}
