/** Exact modular arithmetic used by the polynomial research prototype. */

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
}

/** Return the unique representative r in [0, modulus - 1]. */
export function normalizeMod(value: bigint, modulus: bigint): bigint {
  assertBigInt(value, 'value');
  assertModulus(modulus);
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

export function addMod(a: bigint, b: bigint, modulus: bigint): bigint {
  assertBigInt(a, 'a');
  assertBigInt(b, 'b');
  assertModulus(modulus);
  return normalizeMod(a + b, modulus);
}

export function subtractMod(a: bigint, b: bigint, modulus: bigint): bigint {
  assertBigInt(a, 'a');
  assertBigInt(b, 'b');
  assertModulus(modulus);
  return normalizeMod(a - b, modulus);
}

export function negateMod(value: bigint, modulus: bigint): bigint {
  assertBigInt(value, 'value');
  assertModulus(modulus);
  return normalizeMod(-value, modulus);
}

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

  while (remaining > 0n) {
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
