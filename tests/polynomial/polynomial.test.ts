import { describe, expect, it } from 'vitest';

import {
  decodePolynomial,
  encodePolynomial,
  Polynomial,
  createRingParameters
} from "../../src/core/polynomial/index.js";

const ring = createRingParameters(17n, 4);
const poly = (coefficients: readonly bigint[]) => Polynomial.fromCoefficients(ring, coefficients);
const coeffs = (polynomial: Polynomial) => [...polynomial.coefficients];

describe('Layer 2: polynomial quotient ring arithmetic', () => {
  it('stores exactly n canonical coefficients in ascending-degree order', () => {
    const value = poly([1n, 2n, 3n, 4n]);
    expect(value.coefficients).toEqual([1n, 2n, 3n, 4n]);
    expect(value.coefficients).toHaveLength(4);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.coefficients)).toBe(true);
  });

  it('normalizes signed coefficients and coefficients greater than or equal to q', () => {
    expect(coeffs(poly([-1n, 17n, 18n, 35n]))).toEqual([16n, 0n, 1n, 1n]);
  });

  it('reduces high-degree terms using X^n = -1', () => {
    expect(coeffs(poly([1n, 2n, 3n, 4n, 5n]))).toEqual([13n, 2n, 3n, 4n]);
    expect(coeffs(poly([0n, 0n, 0n, 0n, 1n]))).toEqual([16n, 0n, 0n, 0n]);
    expect(coeffs(Polynomial.monomial(ring, 1n, 9))).toEqual([0n, 1n, 0n, 0n]);
  });

  it('constructs zero, one, and monomials', () => {
    expect(coeffs(Polynomial.zero(ring))).toEqual([0n, 0n, 0n, 0n]);
    expect(coeffs(Polynomial.one(ring))).toEqual([1n, 0n, 0n, 0n]);
    expect(coeffs(Polynomial.monomial(ring, 7n, 2))).toEqual([0n, 0n, 7n, 0n]);
    expect(Polynomial.zero(ring).isZero()).toBe(true);
    expect(Polynomial.one(ring).isZero()).toBe(false);
  });

  it('rejects malformed coefficient arrays and non-bigint coefficients', () => {
    expect(() => Polynomial.fromCoefficients(ring, null as never)).toThrow(/array/);
    expect(() => Polynomial.fromCoefficients(ring, [1, 2] as never)).toThrow(/bigint/);
    expect(() => Polynomial.fromCanonicalCoefficients(ring, [1n, 2n])).toThrow(/exactly 4/);
    expect(() => Polynomial.fromCanonicalCoefficients(ring, [0n, 1n, 17n, 0n])).toThrow(/in \[0, 16\]/);
    expect(() => Polynomial.fromCanonicalCoefficients(ring, [0n, -1n, 0n, 0n])).toThrow(/in \[0, 16\]/);
    const sparse = new Array<bigint>(4);
    expect(() => Polynomial.fromCanonicalCoefficients(ring, sparse)).toThrow(/must be a bigint/);
  });

  it('supports safe coefficient access and rejects invalid indices', () => {
    const value = poly([1n, 2n, 3n, 4n]);
    expect(value.coefficient(0)).toBe(1n);
    expect(value.coefficient(3)).toBe(4n);
    for (const index of [-1, 4, 0.5, Number.NaN]) {
      expect(() => value.coefficient(index)).toThrow(/coefficient index/);
    }
  });

  it('adds and subtracts coefficient-wise modulo q', () => {
    const a = poly([16n, 1n, 2n, 3n]);
    const b = poly([2n, 3n, 4n, 5n]);
    expect(coeffs(a.add(b))).toEqual([1n, 4n, 6n, 8n]);
    expect(coeffs(a.subtract(b))).toEqual([14n, 15n, 15n, 15n]);
    expect(a.subtract(a).isZero()).toBe(true);
  });

  it('supports additive inverse and scalar multiplication', () => {
    const a = poly([16n, 1n, 2n, 3n]);
    expect(coeffs(a.negate())).toEqual([1n, 16n, 15n, 14n]);
    expect(coeffs(a.add(a.negate()))).toEqual([0n, 0n, 0n, 0n]);
    expect(coeffs(a.scale(-2n))).toEqual([2n, 15n, 13n, 11n]);
    expect(coeffs(a.scale(17n))).toEqual([0n, 0n, 0n, 0n]);
  });

  it('multiplies polynomials and performs negacyclic reduction', () => {
    const a = poly([1n, 2n, 0n, 0n]);
    const b = poly([3n, 4n, 0n, 0n]);
    expect(coeffs(a.multiply(b))).toEqual([3n, 10n, 8n, 0n]);

    const x3 = Polynomial.monomial(ring, 1n, 3);
    const x = Polynomial.monomial(ring, 1n, 1);
    expect(coeffs(x3.multiply(x))).toEqual([16n, 0n, 0n, 0n]); // X^4 = -1
    expect(x.power(4n).equals(Polynomial.one(ring).negate())).toBe(true);
  });

  it('supports polynomial powers using repeated squaring', () => {
    const x = Polynomial.monomial(ring, 1n, 1);
    expect(x.power(0n).equals(Polynomial.one(ring))).toBe(true);
    expect(x.power(1n).equals(x)).toBe(true);
    expect(x.power(2n).equals(Polynomial.monomial(ring, 1n, 2))).toBe(true);
    expect(x.power(4n).equals(Polynomial.one(ring).negate())).toBe(true);
    expect(() => x.power(-1n)).toThrow(/non-negative/);
    expect(() => x.power(2 as never)).toThrow(/bigint/);
  });

  it('satisfies additive and multiplicative identities', () => {
    const a = poly([2n, 3n, 5n, 7n]);
    const zero = Polynomial.zero(ring);
    const one = Polynomial.one(ring);
    expect(a.add(zero).equals(a)).toBe(true);
    expect(a.multiply(one).equals(a)).toBe(true);
    expect(a.multiply(zero).isZero()).toBe(true);
  });

  it('satisfies commutativity, associativity, and distributivity on deterministic cases', () => {
    const samples = [
      poly([1n, 2n, 3n, 4n]),
      poly([16n, 0n, 8n, 1n]),
      poly([4n, 7n, 0n, 12n]),
      poly([0n, 0n, 0n, 1n]),
    ];
    for (const a of samples) {
      for (const b of samples) {
        expect(a.add(b).equals(b.add(a))).toBe(true);
        expect(a.multiply(b).equals(b.multiply(a))).toBe(true);
        for (const c of samples) {
          expect(a.add(b).add(c).equals(a.add(b.add(c)))).toBe(true);
          expect(a.multiply(b).multiply(c).equals(a.multiply(b.multiply(c)))).toBe(true);
          expect(a.multiply(b.add(c)).equals(a.multiply(b).add(a.multiply(c)))).toBe(true);
        }
      }
    }
  });

  it('rejects operations across incompatible rings', () => {
    const a = poly([1n, 2n, 3n, 4n]);
    const otherQ = Polynomial.fromCoefficients(createRingParameters(19n, 4), [1n, 2n, 3n, 4n]);
    const otherN = Polynomial.fromCoefficients(createRingParameters(17n, 3), [1n, 2n, 3n]);
    expect(() => a.add(otherQ)).toThrow(/parameters do not match/);
    expect(() => a.multiply(otherN)).toThrow(/parameters do not match/);
    expect(a.equals(otherQ)).toBe(false);
  });

  it('does not retain caller-owned coefficient arrays', () => {
    const input = [1n, 2n, 3n, 4n];
    const value = Polynomial.fromCanonicalCoefficients(ring, input);
    input[0] = 16n;
    expect(value.coefficient(0)).toBe(1n);
    expect(Object.isFrozen(value.coefficients)).toBe(true);
  });

  it('encodes and decodes canonical JSON-compatible representations', () => {
    const original = poly([-1n, 2n, 18n, 4n]);
    const encoded = encodePolynomial(original);
    expect(encoded).toEqual({
      format: 'ppc-polynomial-v1',
      modulus: '17',
      degree: 4,
      quotient: 'x^n+1',
      coefficients: ['16', '2', '1', '4'],
    });
    expect(decodePolynomial(ring, encoded).equals(original)).toBe(true);
    expect(decodePolynomial(ring, JSON.parse(JSON.stringify(original))).equals(original)).toBe(true);
  });

  it('rejects non-canonical or mismatched encodings', () => {
    const encoded = encodePolynomial(poly([1n, 2n, 3n, 4n]));
    expect(() => decodePolynomial(ring, null)).toThrow(/object/);
    expect(() => decodePolynomial(ring, { ...encoded, format: 'unknown' })).toThrow(/format/);
    expect(() => decodePolynomial(ring, { ...encoded, modulus: '19' })).toThrow(/modulus/);
    expect(() => decodePolynomial(ring, { ...encoded, degree: 3 })).toThrow(/degree/);
    expect(() => decodePolynomial(ring, { ...encoded, quotient: 'x^n-1' })).toThrow(/quotient/);
    expect(() => decodePolynomial(ring, { ...encoded, coefficients: ['1'] })).toThrow(/exactly 4/);
    expect(() => decodePolynomial(ring, { ...encoded, coefficients: ['01', '2', '3', '4'] })).toThrow(/canonical unsigned decimal/);
    expect(() => decodePolynomial(ring, { ...encoded, coefficients: ['17', '2', '3', '4'] })).toThrow(/outside/);
    expect(() => decodePolynomial(ring, { ...encoded, extra: true })).toThrow(/unexpected fields/);
  });

  it('provides deterministic coefficients for the reference-shaped q=3329, n=256 ring', () => {
    const referenceRing = createRingParameters(3329n, 256);
    const a = Polynomial.monomial(referenceRing, 1n, 255);
    const x = Polynomial.monomial(referenceRing, 1n, 1);
    const product = a.multiply(x);
    expect(product.coefficient(0)).toBe(3328n);
    expect(product.coefficients.slice(1).every((coefficient) => coefficient === 0n)).toBe(true);
  });
});
