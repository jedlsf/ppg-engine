import { describe, expect, it } from 'vitest';
import {
  createRingParameters,
  MAX_SUPPORTED_POLYNOMIAL_DEGREE,
  NEGACYCLIC_QUOTIENT,
  normalizeRingParameters,
  ringParameterKey,
  sameRing,
} from "../../src/core/polynomial/index.js";

describe('Layer 2: polynomial ring parameters', () => {
  it('creates canonical immutable parameters for R_q = Z_q[X]/(X^n + 1)', () => {
    const ring = createRingParameters(17n, 4);
    expect(ring).toEqual({ modulus: 17n, degree: 4, quotient: NEGACYCLIC_QUOTIENT });
    expect(Object.isFrozen(ring)).toBe(true);
  });

  it('supports a toy ring and a reference-shaped degree-256 ring', () => {
    expect(createRingParameters(17n, 4).degree).toBe(4);
    expect(createRingParameters(3329n, 256).modulus).toBe(3329n);
  });

  it('accepts composite q as a ring modulus without claiming it is a field', () => {
    expect(createRingParameters(15n, 2).modulus).toBe(15n);
  });

  it('normalizes a mutable caller object into a frozen copy', () => {
    const caller = { modulus: 17n, degree: 4, quotient: 'x^n+1' as const };
    const normalized = normalizeRingParameters(caller);
    caller.degree = 8;
    expect(normalized.degree).toBe(4);
    expect(Object.isFrozen(normalized)).toBe(true);
  });

  it('compares rings by mathematical parameters rather than object identity', () => {
    expect(sameRing(createRingParameters(17n, 4), createRingParameters(17n, 4))).toBe(true);
    expect(sameRing(createRingParameters(17n, 4), createRingParameters(19n, 4))).toBe(false);
    expect(sameRing(createRingParameters(17n, 4), createRingParameters(17n, 5))).toBe(false);
  });

  it('creates a stable descriptive key', () => {
    expect(ringParameterKey(createRingParameters(17n, 4))).toBe('Z_17[X]/(X^4+1)');
  });

  it('rejects invalid or unsupported moduli', () => {
    expect(() => createRingParameters(1n, 4)).toThrow(/>= 2/);
    expect(() => createRingParameters(0n, 4)).toThrow(/>= 2/);
    expect(() => createRingParameters(-17n, 4)).toThrow(/>= 2/);
    expect(() => createRingParameters(17 as unknown as bigint, 4)).toThrow(/bigint/);
  });

  it('rejects invalid degrees', () => {
    for (const degree of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createRingParameters(17n, degree)).toThrow(/degree/);
    }
    expect(() => createRingParameters(17n, MAX_SUPPORTED_POLYNOMIAL_DEGREE + 1)).toThrow(/implementation limit/);
  });

  it('rejects malformed or unsupported quotient parameters', () => {
    expect(() => normalizeRingParameters(null as never)).toThrow(/object/);
    expect(() => normalizeRingParameters({ modulus: 17n, degree: 4, quotient: 'x^n-1' } as never)).toThrow(/Unsupported quotient/);
  });
});
