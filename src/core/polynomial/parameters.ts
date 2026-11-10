import { assertModulus } from './modular.js';

/** This implementation cap is an engineering guard, not a cryptographic parameter. */
export const MAX_SUPPORTED_POLYNOMIAL_DEGREE = 4096;

/** Maximum dense state size, measured as slotCount multiplied by degree. */
export const MAX_SUPPORTED_STATE_COEFFICIENTS = 262_144;

/** Maximum input length accepted by the reducing polynomial constructor. */
export const MAX_SUPPORTED_INPUT_COEFFICIENTS = 65_536;

/**
 * Describe the negacyclic_quotient API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export const NEGACYCLIC_QUOTIENT = 'x^n+1' as const;

/** Parameters for R_q = Z_q[X] / (X^n + 1). */
export interface PolynomialRingParameters {
  readonly modulus: bigint;
  readonly degree: number;
  readonly quotient: typeof NEGACYCLIC_QUOTIENT;
}

/** Create a normalized immutable ring descriptor for R_q = Z_q[X]/(X^n + 1). */
export function createRingParameters(
  modulus: bigint,
  degree: number,
): PolynomialRingParameters {
  assertModulus(modulus);
  if (!Number.isSafeInteger(degree) || degree <= 0) {
    throw new RangeError(`degree must be a positive safe integer; received ${String(degree)}`);
  }
  if (degree > MAX_SUPPORTED_POLYNOMIAL_DEGREE) {
    throw new RangeError(
      `degree exceeds implementation limit ${MAX_SUPPORTED_POLYNOMIAL_DEGREE}; received ${degree}`,
    );
  }

  return Object.freeze({ modulus, degree, quotient: NEGACYCLIC_QUOTIENT });
}

/** Revalidate possibly untrusted runtime input and return a frozen normalized copy. */
export function normalizeRingParameters(
  value: PolynomialRingParameters,
): PolynomialRingParameters {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Polynomial ring parameters must be an object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Polynomial ring parameters must be a plain data object');
  for (const key of ['modulus', 'degree', 'quotient'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw new TypeError(`Polynomial ring parameter ${key} must be an own data property`);
  }
  if (value.quotient !== NEGACYCLIC_QUOTIENT) {
    throw new RangeError(`Unsupported quotient polynomial: ${String(value.quotient)}`);
  }
  return createRingParameters(value.modulus, value.degree);
}

/**
 * Compare ring parameters by their mathematical values rather than object identity.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function sameRing(
  left: PolynomialRingParameters,
  right: PolynomialRingParameters,
): boolean {
  return (
    typeof left === 'object' && left !== null &&
    typeof right === 'object' && right !== null &&
    left.modulus === right.modulus &&
    left.degree === right.degree &&
    left.quotient === right.quotient
  );
}

/** Stable text key for comparisons/logging; not a cryptographic hash. */
export function ringParameterKey(parameters: PolynomialRingParameters): string {
  const ring = normalizeRingParameters(parameters);
  return `Z_${ring.modulus}[X]/(X^${ring.degree}+1)`;
}
