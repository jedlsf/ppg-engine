import { SlotIndexingEngine, systemSpecKey } from "../geometry/index.js";
import {
  normalizeRingParameters,
  PolynomialRingParameters,
  PolynomialState,
  ringParameterKey,
} from "../polynomial/index.js";

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

export interface TransformationContext {
  readonly systemKey: string;
  readonly ringKey: string;
  readonly ring: PolynomialRingParameters;
}

export function createTransformationContext(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
): TransformationContext {
  if (engine === null || typeof engine !== "object" || !engine.spec) {
    throw new TypeError("A valid SlotIndexingEngine is required");
  }
  const normalizedRing = normalizeRingParameters(ring);
  return Object.freeze({
    systemKey: systemSpecKey(engine),
    ringKey: ringParameterKey(normalizedRing),
    ring: normalizedRing,
  });
}

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

export function assertTransformationCompatible(
  transformation: PolynomialStateTransformation,
  context: TransformationContext,
): void {
  if (transformation === null || typeof transformation !== "object") {
    throw new TypeError("Transformation must be an object");
  }
  if (
    typeof transformation.name !== "string" ||
    transformation.name.length === 0
  ) {
    throw new TypeError("Transformation name must be a non-empty string");
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
