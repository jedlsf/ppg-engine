import { addMod, multiplyMod, negateMod, normalizeMod, subtractMod } from './modular.js';
import {
  createRingParameters,
  normalizeRingParameters,
  sameRing,
  type PolynomialRingParameters,
} from './parameters.js';

export interface PolynomialEncoding {
  readonly format: 'ppc-polynomial-v1';
  readonly modulus: string;
  readonly degree: number;
  readonly quotient: 'x^n+1';
  readonly coefficients: readonly string[];
}

/**
 * Immutable canonical polynomial in R_q = Z_q[X]/(X^n + 1).
 * Coefficients are always stored in ascending-degree order, with exactly n
 * entries, each in [0, q - 1].
 *
 * This is research/reference code. BigInt arithmetic is not constant-time and
 * this class must not be treated as production cryptographic implementation.
 */
export class Polynomial {
  public readonly ring: PolynomialRingParameters;
  public readonly coefficients: readonly bigint[];

  private constructor(ring: PolynomialRingParameters, canonicalCoefficients: readonly bigint[]) {
    this.ring = normalizeRingParameters(ring);
    this.coefficients = Object.freeze([...canonicalCoefficients]);
    Object.freeze(this);
  }

  /**
   * Construct from coefficients that may be signed, outside [0,q), or have
   * degree >= n. Powers are reduced using X^n = -1.
   */
  public static fromCoefficients(
    ring: PolynomialRingParameters,
    coefficients: readonly bigint[],
  ): Polynomial {
    const normalizedRing = normalizeRingParameters(ring);
    if (!Array.isArray(coefficients)) {
      throw new TypeError('coefficients must be an array of bigint values');
    }

    const output = Array<bigint>(normalizedRing.degree).fill(0n);
    for (let exponent = 0; exponent < coefficients.length; exponent += 1) {
      const value = coefficients[exponent];
      if (typeof value !== 'bigint') {
        throw new TypeError(`coefficient ${exponent} must be a bigint`);
      }
      const wrappedDegree = Math.floor(exponent / normalizedRing.degree);
      const targetDegree = exponent % normalizedRing.degree;
      const signedValue = wrappedDegree % 2 === 0 ? value : -value;
      output[targetDegree] = addMod(
        output[targetDegree]!,
        signedValue,
        normalizedRing.modulus,
      );
    }

    return new Polynomial(normalizedRing, output);
  }

  /** Construct only from canonical fixed-width coefficients; rejects instead of reducing. */
  public static fromCanonicalCoefficients(
    ring: PolynomialRingParameters,
    coefficients: readonly bigint[],
  ): Polynomial {
    const normalizedRing = normalizeRingParameters(ring);
    if (!Array.isArray(coefficients)) {
      throw new TypeError('coefficients must be an array');
    }
    if (coefficients.length !== normalizedRing.degree) {
      throw new RangeError(
        `Expected exactly ${normalizedRing.degree} coefficients; received ${coefficients.length}`,
      );
    }

    const copied = new Array<bigint>(normalizedRing.degree);
    for (let index = 0; index < normalizedRing.degree; index += 1) {
      // Index-based access also rejects sparse arrays, which Array#map skips.
      const coefficient = coefficients[index];
      if (typeof coefficient !== 'bigint') {
        throw new TypeError(`coefficient ${index} must be a bigint`);
      }
      if (coefficient < 0n || coefficient >= normalizedRing.modulus) {
        throw new RangeError(
          `coefficient ${index} must be in [0, ${normalizedRing.modulus - 1n}]`,
        );
      }
      copied[index] = coefficient;
    }

    return new Polynomial(normalizedRing, copied);
  }

  public static zero(ring: PolynomialRingParameters): Polynomial {
    const normalizedRing = normalizeRingParameters(ring);
    return new Polynomial(normalizedRing, Array<bigint>(normalizedRing.degree).fill(0n));
  }

  public static one(ring: PolynomialRingParameters): Polynomial {
    const normalizedRing = normalizeRingParameters(ring);
    const coefficients = Array<bigint>(normalizedRing.degree).fill(0n);
    coefficients[0] = 1n;
    return new Polynomial(normalizedRing, coefficients);
  }

  /** Construct c*X^exponent, reducing the exponent using X^n = -1. */
  public static monomial(
    ring: PolynomialRingParameters,
    coefficient: bigint,
    exponent: number,
  ): Polynomial {
    const normalizedRing = normalizeRingParameters(ring);
    if (typeof coefficient !== 'bigint') {
      throw new TypeError('coefficient must be a bigint');
    }
    if (!Number.isSafeInteger(exponent) || exponent < 0) {
      throw new RangeError('exponent must be a non-negative safe integer');
    }

    const wrappedDegree = Math.floor(exponent / normalizedRing.degree);
    const targetDegree = exponent % normalizedRing.degree;
    const signedCoefficient = wrappedDegree % 2 === 0 ? coefficient : -coefficient;
    const coefficients = Array<bigint>(normalizedRing.degree).fill(0n);
    coefficients[targetDegree] = normalizeMod(signedCoefficient, normalizedRing.modulus);
    return new Polynomial(normalizedRing, coefficients);
  }

  public coefficient(index: number): bigint {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.ring.degree) {
      throw new RangeError(`coefficient index must be in [0, ${this.ring.degree - 1}]`);
    }
    return this.coefficients[index]!;
  }

  public isZero(): boolean {
    return this.coefficients.every((coefficient) => coefficient === 0n);
  }

  public equals(other: Polynomial): boolean {
    if (!(other instanceof Polynomial) || !sameRing(this.ring, other.ring)) {
      return false;
    }
    return this.coefficients.every((coefficient, index) => coefficient === other.coefficients[index]);
  }

  public add(other: Polynomial): Polynomial {
    this.assertCompatible(other);
    const output = this.coefficients.map((coefficient, index) =>
      addMod(coefficient, other.coefficients[index]!, this.ring.modulus),
    );
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  public subtract(other: Polynomial): Polynomial {
    this.assertCompatible(other);
    const output = this.coefficients.map((coefficient, index) =>
      subtractMod(coefficient, other.coefficients[index]!, this.ring.modulus),
    );
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  public negate(): Polynomial {
    const output = this.coefficients.map((coefficient) => negateMod(coefficient, this.ring.modulus));
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  /** Multiply two polynomials and reduce modulo q and X^n + 1. */
  public multiply(other: Polynomial): Polynomial {
    this.assertCompatible(other);
    const degree = this.ring.degree;
    const modulus = this.ring.modulus;
    const accumulators = Array<bigint>(degree).fill(0n);

    for (let i = 0; i < degree; i += 1) {
      const left = this.coefficients[i]!;
      if (left === 0n) continue;
      for (let j = 0; j < degree; j += 1) {
        const right = other.coefficients[j]!;
        if (right === 0n) continue;
        const exponent = i + j;
        const target = exponent < degree ? exponent : exponent - degree;
        const product = left * right;
        accumulators[target] = exponent < degree
          ? accumulators[target]! + product
          : accumulators[target]! - product;
      }
    }

    const output = accumulators.map((value) => normalizeMod(value, modulus));
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  public scale(scalar: bigint): Polynomial {
    if (typeof scalar !== 'bigint') {
      throw new TypeError('scalar must be a bigint');
    }
    const output = this.coefficients.map((coefficient) =>
      multiplyMod(coefficient, scalar, this.ring.modulus),
    );
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  /** Non-negative polynomial exponentiation by repeated squaring. */
  public power(exponent: bigint): Polynomial {
    if (typeof exponent !== 'bigint') {
      throw new TypeError('exponent must be a bigint');
    }
    if (exponent < 0n) {
      throw new RangeError('exponent must be non-negative');
    }

    let result = Polynomial.one(this.ring);
    let base: Polynomial = this;
    let remaining = exponent;
    while (remaining > 0n) {
      if ((remaining & 1n) === 1n) result = result.multiply(base);
      remaining >>= 1n;
      if (remaining > 0n) base = base.multiply(base);
    }
    return result;
  }

  public encode(): PolynomialEncoding {
    return encodePolynomial(this);
  }

  /** Enables JSON.stringify(poly) to produce the canonical research encoding. */
  public toJSON(): PolynomialEncoding {
    return this.encode();
  }

  private assertCompatible(other: Polynomial): void {
    if (!(other instanceof Polynomial)) {
      throw new TypeError('Operand must be a Polynomial');
    }
    if (!sameRing(this.ring, other.ring)) {
      throw new RangeError('Polynomial ring parameters do not match');
    }
  }
}

/** Canonical string encoding, suitable for reproducible research fixtures. */
export function encodePolynomial(polynomial: Polynomial): PolynomialEncoding {
  if (!(polynomial instanceof Polynomial)) {
    throw new TypeError('polynomial must be a Polynomial');
  }
  return Object.freeze({
    format: 'ppc-polynomial-v1',
    modulus: polynomial.ring.modulus.toString(10),
    degree: polynomial.ring.degree,
    quotient: polynomial.ring.quotient,
    coefficients: Object.freeze(polynomial.coefficients.map((value) => value.toString(10))),
  });
}

/** Strictly decode the canonical JSON-compatible representation. */
export function decodePolynomial(
  ring: PolynomialRingParameters,
  input: unknown,
): Polynomial {
  const normalizedRing = normalizeRingParameters(ring);
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Polynomial encoding must be an object');
  }

  const record = input as Record<string, unknown>;
  const allowedKeys = ['format', 'modulus', 'degree', 'quotient', 'coefficients'];
  const keys = Object.keys(record);
  if (keys.length !== allowedKeys.length || allowedKeys.some((key) => !Object.hasOwn(record, key))) {
    throw new RangeError('Polynomial encoding has missing or unexpected fields');
  }
  if (record.format !== 'ppc-polynomial-v1') {
    throw new RangeError(`Unsupported polynomial encoding format: ${String(record.format)}`);
  }
  if (record.modulus !== normalizedRing.modulus.toString(10)) {
    throw new RangeError('Encoded modulus does not match the target ring');
  }
  if (record.degree !== normalizedRing.degree) {
    throw new RangeError('Encoded degree does not match the target ring');
  }
  if (record.quotient !== normalizedRing.quotient) {
    throw new RangeError('Encoded quotient polynomial does not match the target ring');
  }
  if (!Array.isArray(record.coefficients)) {
    throw new TypeError('Encoded coefficients must be an array');
  }
  if (record.coefficients.length !== normalizedRing.degree) {
    throw new RangeError(`Expected exactly ${normalizedRing.degree} encoded coefficients`);
  }

  const coefficients = new Array<bigint>(normalizedRing.degree);
  for (let index = 0; index < normalizedRing.degree; index += 1) {
    const value = record.coefficients[index];
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new RangeError(`Encoded coefficient ${index} is not a canonical unsigned decimal string`);
    }
    const coefficient = BigInt(value);
    if (coefficient >= normalizedRing.modulus) {
      throw new RangeError(`Encoded coefficient ${index} is outside [0, q - 1]`);
    }
    coefficients[index] = coefficient;
  }

  return Polynomial.fromCanonicalCoefficients(normalizedRing, coefficients);
}

/** Helpers for functions that need exact ring compatibility. */
export function assertSameRing(
  left: PolynomialRingParameters,
  right: PolynomialRingParameters,
): void {
  if (!sameRing(left, right)) {
    throw new RangeError('Polynomial ring parameters do not match');
  }
}

/** Convenience factory for normalized parameters, re-exported alongside Polynomial. */
export { createRingParameters };
