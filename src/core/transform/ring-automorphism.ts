import { SlotIndexingEngine } from "../geometry/index.js";
import {
  normalizeMod,
  normalizeRingParameters,
  Polynomial,
  PolynomialRingParameters,
  PolynomialState,
} from "../polynomial/index.js";
import {
  assertStateMatchesContext,
  createTransformationContext,
  type PolynomialStateTransformation,
} from "./types.js";

/** Greatest common divisor for non-negative safe integers. */
export function gcdNumber(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 0 || b < 0) {
    throw new RangeError("gcdNumber expects non-negative safe integers");
  }
  let left = a;
  let right = b;
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

/** Multiplicative inverse modulo m; requires gcd(value, m) = 1. */
export function modularInverseNumber(value: number, modulus: number): number {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(modulus) ||
    modulus <= 1
  ) {
    throw new RangeError(
      "modularInverseNumber requires safe integers and modulus > 1",
    );
  }
  let oldR = ((value % modulus) + modulus) % modulus;
  let r = modulus;
  // Standard extended Euclidean algorithm, tracking the coefficient of value.
  let oldT = 1;
  let t = 0;
  while (r !== 0) {
    const quotient = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - quotient * r];
    [oldT, t] = [t, oldT - quotient * t];
  }
  if (oldR !== 1) {
    throw new RangeError(
      `${value} has no multiplicative inverse modulo ${modulus}`,
    );
  }
  return ((oldT % modulus) + modulus) % modulus;
}

/**
 * Ring automorphism X -> X^k on R_q = Z_q[X]/(X^n + 1).
 * The exponent must be coprime to 2n. Coefficient modulus q may be composite;
 * this substitution automorphism does not require q to be prime.
 */
export class RingAutomorphism implements PolynomialStateTransformation {
  public readonly kind = "ring-automorphism" as const;
  public readonly name: string;
  public readonly systemKey: string;
  public readonly ringKey: string;
  public readonly ring: PolynomialRingParameters;
  /** Canonical exponent in [1, 2n - 1]. */
  public readonly exponent: number;
  private readonly engine: SlotIndexingEngine;

  public constructor(
    engine: SlotIndexingEngine,
    ring: PolynomialRingParameters,
    exponent: number,
    name?: string,
  ) {
    const context = createTransformationContext(engine, ring);
    const n = context.ring.degree;
    const period = 2 * n;
    if (!Number.isSafeInteger(exponent) || exponent <= 0) {
      throw new RangeError(
        "Automorphism exponent must be a positive safe integer",
      );
    }
    const canonicalExponent = exponent % period;
    if (canonicalExponent === 0 || gcdNumber(canonicalExponent, period) !== 1) {
      throw new RangeError(
        `Automorphism exponent must be coprime to 2n=${period}`,
      );
    }
    const normalizedName = name ?? `X->X^${canonicalExponent}`;
    if (
      typeof normalizedName !== "string" ||
      normalizedName.trim().length === 0
    ) {
      throw new TypeError("name must be a non-empty string");
    }
    this.engine = engine;
    this.ring = context.ring;
    this.systemKey = context.systemKey;
    this.ringKey = context.ringKey;
    this.exponent = canonicalExponent;
    this.name = normalizedName;
    Object.freeze(this);
  }

  public applyPolynomial(polynomial: Polynomial): Polynomial {
    if (!(polynomial instanceof Polynomial)) {
      throw new TypeError("polynomial must be a Polynomial");
    }
    if (
      polynomial.ring.modulus !== this.ring.modulus ||
      polynomial.ring.degree !== this.ring.degree ||
      polynomial.ring.quotient !== this.ring.quotient
    ) {
      throw new RangeError("Polynomial uses incompatible ring parameters");
    }

    const n = this.ring.degree;
    const q = this.ring.modulus;
    const output = Array<bigint>(n).fill(0n);
    for (let i = 0; i < n; i += 1) {
      const coefficient = polynomial.coefficients[i]!;
      if (coefficient === 0n) continue;
      const mappedExponent = i * this.exponent;
      const target = mappedExponent % n;
      const quotient = Math.floor(mappedExponent / n);
      const signed = quotient % 2 === 0 ? coefficient : -coefficient;
      output[target] = normalizeMod(output[target]! + signed, q);
    }
    return Polynomial.fromCanonicalCoefficients(this.ring, output);
  }

  public apply(state: PolynomialState): PolynomialState {
    assertStateMatchesContext(state, this.systemKey, this.ringKey);
    return state.mapValues((_slot, _coordinate, current) =>
      this.applyPolynomial(current),
    );
  }

  public inverse(): RingAutomorphism {
    const inverseExponent = modularInverseNumber(
      this.exponent,
      2 * this.ring.degree,
    );
    return new RingAutomorphism(
      this.engine,
      this.ring,
      inverseExponent,
      `${this.name}^-1`,
    );
  }
}

/** Convenience constructor; validates/normalizes parameters via RingAutomorphism. */
export function createRingAutomorphism(
  engine: SlotIndexingEngine,
  ring: PolynomialRingParameters,
  exponent: number,
  name?: string,
): RingAutomorphism {
  return new RingAutomorphism(
    engine,
    normalizeRingParameters(ring),
    exponent,
    name,
  );
}
