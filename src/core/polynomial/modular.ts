/**
 * Exact modular arithmetic helpers for Layer 2.
 * BigInt operations are not guaranteed to be constant-time.
 */
export const MAX_SUPPORTED_MODULUS_BITS = 4_096;
/**
 * Describe the max_supported_modular_exponent_steps API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export const MAX_SUPPORTED_MODULAR_EXPONENT_STEPS = 4_096;

function assertBigInt(value: unknown, name: string): asserts value is bigint {
  if (typeof value !== 'bigint') {
    throw new TypeError(`${name} must be a bigint`);
  }
}

/** Validate a modulus. This accepts composite moduli as well as primes. */
export function assertModulus(modulus: bigint): void {
  assertBigInt(modulus, 'modulus');
  if (modulus < 2n) {
    throw new RangeError(`modulus must be >= 2; received ${String(modulus)}`);
  }
  if (modulus.toString(2).length > MAX_SUPPORTED_MODULUS_BITS) {
    throw new RangeError(`modulus exceeds the supported ${MAX_SUPPORTED_MODULUS_BITS}-bit limit`);
  }
}

/** Return the unique representative r in [0, modulus - 1]. */
export function normalizeMod(value: bigint, modulus: bigint): bigint {
  assertBigInt(value, 'value');
  assertModulus(modulus);
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

/**
 * Add two BigInt values modulo the supplied modulus.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function addMod(a: bigint, b: bigint, modulus: bigint): bigint {
  assertBigInt(a, 'a');
  assertBigInt(b, 'b');
  assertModulus(modulus);
  return normalizeMod(a + b, modulus);
}

/**
 * Subtract one BigInt value from another modulo the supplied modulus.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function subtractMod(a: bigint, b: bigint, modulus: bigint): bigint {
  assertBigInt(a, 'a');
  assertBigInt(b, 'b');
  assertModulus(modulus);
  return normalizeMod(a - b, modulus);
}

/**
 * Return the additive inverse of a BigInt value modulo the supplied modulus.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function negateMod(value: bigint, modulus: bigint): bigint {
  assertBigInt(value, 'value');
  assertModulus(modulus);
  return normalizeMod(-value, modulus);
}

/**
 * Multiply two BigInt values modulo the supplied modulus.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export function multiplyMod(a: bigint, b: bigint, modulus: bigint): bigint {
  assertBigInt(a, 'a');
  assertBigInt(b, 'b');
  assertModulus(modulus);
  return normalizeMod(a * b, modulus);
}

/** Modular exponentiation by repeated squaring; exponent must be non-negative. */
export function powerMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
  assertBigInt(base, 'base');
  assertBigInt(exponent, 'exponent');
  assertModulus(modulus);
  if (exponent < 0n) {
    throw new RangeError('exponent must be non-negative');
  }

  let result = 1n % modulus;
  let factor = normalizeMod(base, modulus);
  let remaining = exponent;
  let steps = 0;

  while (remaining > 0n) {
    steps += 1;
    if (steps > MAX_SUPPORTED_MODULAR_EXPONENT_STEPS) {
      throw new RangeError(`Exponent exceeds the supported ${MAX_SUPPORTED_MODULAR_EXPONENT_STEPS}-bit processing limit`);
    }
    if ((remaining & 1n) === 1n) {
      result = multiplyMod(result, factor, modulus);
    }
    remaining >>= 1n;
    if (remaining > 0n) {
      factor = multiplyMod(factor, factor, modulus);
    }
  }
  return result;
}
