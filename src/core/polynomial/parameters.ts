import { assertModulus } from './modular.js';

/** This implementation cap is an engineering guard, not a cryptographic parameter. */
export const MAX_SUPPORTED_POLYNOMIAL_DEGREE = 4096;

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
  if (value === null || typeof value !== 'object') {
    throw new TypeError('Polynomial ring parameters must be an object');
  }
  if (value.quotient !== NEGACYCLIC_QUOTIENT) {
    throw new RangeError(`Unsupported quotient polynomial: ${String(value.quotient)}`);
  }
  return createRingParameters(value.modulus, value.degree);
}

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
