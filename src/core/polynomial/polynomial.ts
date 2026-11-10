import { addMod, multiplyMod, negateMod, normalizeMod, subtractMod } from './modular.js';
import {
  createRingParameters,
  normalizeRingParameters,
  sameRing,
  MAX_SUPPORTED_INPUT_COEFFICIENTS,
  type PolynomialRingParameters,
} from './parameters.js';

/**
 * Canonical JSON-compatible representation used to serialize a polynomial without losing BigInt precision.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
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
  /**
   * Immutable normalized quotient-ring parameters for this polynomial.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ring: PolynomialRingParameters;
  /**
   * Frozen canonical coefficients in ascending-degree order, each in the range [0, q - 1].
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
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
    if (coefficients.length > MAX_SUPPORTED_INPUT_COEFFICIENTS) {
      throw new RangeError(`Coefficient input exceeds the supported limit of ${MAX_SUPPORTED_INPUT_COEFFICIENTS}`);
    }

    const output = Array<bigint>(normalizedRing.degree).fill(0n);
    for (let exponent = 0; exponent < coefficients.length; exponent += 1) {
      if (!Object.hasOwn(coefficients, exponent)) throw new TypeError(`Coefficient array is sparse at index ${exponent}; coefficient must be a bigint`);
      const descriptor = Object.getOwnPropertyDescriptor(coefficients, String(exponent));
      if (!descriptor || !('value' in descriptor)) throw new TypeError(`Coefficient at index ${exponent} must be a data property`);
      const value = descriptor.value;
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
      if (!Object.hasOwn(coefficients, index)) throw new TypeError(`Coefficient array is sparse at index ${index}; coefficient must be a bigint`);
      const descriptor = Object.getOwnPropertyDescriptor(coefficients, String(index));
      if (!descriptor || !('value' in descriptor)) throw new TypeError(`Coefficient at index ${index} must be a data property`);
      const coefficient = descriptor.value;
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

  /**
   * Construct the zero polynomial for a validated ring.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public static zero(ring: PolynomialRingParameters): Polynomial {
    const normalizedRing = normalizeRingParameters(ring);
    return new Polynomial(normalizedRing, Array<bigint>(normalizedRing.degree).fill(0n));
  }

  /**
   * Construct the multiplicative identity for a validated ring.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
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

  /**
   * Return one coefficient by its ascending-degree index.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public coefficient(index: number): bigint {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.ring.degree) {
      throw new RangeError(`coefficient index must be in [0, ${this.ring.degree - 1}]`);
    }
    return this.coefficients[index]!;
  }

  /**
   * Return whether every canonical coefficient is zero.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public isZero(): boolean {
    return this.coefficients.every((coefficient) => coefficient === 0n);
  }

  /**
   * Compare complete geometry, ring, and polynomial-state contents.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public equals(other: Polynomial): boolean {
    if (!(other instanceof Polynomial) || !sameRing(this.ring, other.ring)) {
      return false;
    }
    return this.coefficients.every((coefficient, index) => coefficient === other.coefficients[index]);
  }

  /**
   * Add two compatible polynomials coefficient-wise modulo q.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public add(other: Polynomial): Polynomial {
    this.assertCompatible(other);
    const output = this.coefficients.map((coefficient, index) =>
      addMod(coefficient, other.coefficients[index]!, this.ring.modulus),
    );
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  /**
   * Subtract a compatible polynomial coefficient-wise modulo q.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public subtract(other: Polynomial): Polynomial {
    this.assertCompatible(other);
    const output = this.coefficients.map((coefficient, index) =>
      subtractMod(coefficient, other.coefficients[index]!, this.ring.modulus),
    );
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  /**
   * Return the additive inverse of this polynomial.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
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

  /**
   * Multiply every coefficient by a BigInt scalar modulo q.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
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
    let steps = 0;
    while (remaining > 0n) {
      steps += 1;
      if (steps > 4_096) throw new RangeError('Polynomial exponent exceeds the supported 4096-bit processing limit');
      if ((remaining & 1n) === 1n) result = result.multiply(base);
      remaining >>= 1n;
      if (remaining > 0n) base = base.multiply(base);
    }
    return result;
  }

  /**
   * Return the canonical JSON-compatible encoding of this polynomial.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
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

  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Polynomial encoding must be a plain data object');
  const record = input as Record<string, unknown>;
  const allowedKeys = ['format', 'modulus', 'degree', 'quotient', 'coefficients'];
  const keys = Reflect.ownKeys(record);
  if (keys.some((key) => typeof key !== 'string')) throw new RangeError('Polynomial encoding must not contain symbol properties');
  if (keys.length !== allowedKeys.length || allowedKeys.some((key) => !Object.hasOwn(record, key))) {
    throw new RangeError('Polynomial encoding has missing or unexpected fields');
  }
  for (const key of allowedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !('value' in descriptor)) throw new TypeError(`Polynomial encoding field ${key} must be an own data property`);
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
  const modulusText = normalizedRing.modulus.toString(10);
  for (let index = 0; index < normalizedRing.degree; index += 1) {
    if (!Object.hasOwn(record.coefficients, index)) throw new TypeError(`Encoded coefficient array is sparse at index ${index}`);
    const coefficientDescriptor = Object.getOwnPropertyDescriptor(record.coefficients, String(index));
    if (!coefficientDescriptor || !('value' in coefficientDescriptor)) throw new TypeError(`Encoded coefficient at index ${index} must be a data property`);
    const value = coefficientDescriptor.value;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
      throw new RangeError(`Encoded coefficient ${index} is not a canonical unsigned decimal string`);
    }
    if (value.length > modulusText.length || (value.length === modulusText.length && value >= modulusText)) {
      throw new RangeError(`Encoded coefficient ${index} is outside [0, q - 1]`);
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
