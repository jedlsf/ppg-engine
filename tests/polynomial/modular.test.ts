import { describe, expect, it } from "vitest";
import {
  addMod,
  assertModulus,
  multiplyMod,
  negateMod,
  normalizeMod,
  powerMod,
  subtractMod,
} from "../../src/core/polynomial/index.js";

describe("Layer 2: exact modular arithmetic", () => {
  it("normalizes positive, negative, and multiple-modulus values", () => {
    expect(normalizeMod(0n, 17n)).toBe(0n);
    expect(normalizeMod(16n, 17n)).toBe(16n);
    expect(normalizeMod(17n, 17n)).toBe(0n);
    expect(normalizeMod(35n, 17n)).toBe(1n);
    expect(normalizeMod(-1n, 17n)).toBe(16n);
    expect(normalizeMod(-35n, 17n)).toBe(16n);
  });

  it("adds modulo q", () => {
    expect(addMod(16n, 4n, 17n)).toBe(3n);
    expect(addMod(-1n, 1n, 17n)).toBe(0n);
  });

  it("subtracts modulo q", () => {
    expect(subtractMod(2n, 5n, 17n)).toBe(14n);
    expect(subtractMod(5n, 2n, 17n)).toBe(3n);
  });

  it("negates modulo q", () => {
    expect(negateMod(1n, 17n)).toBe(16n);
    expect(negateMod(17n, 17n)).toBe(0n);
    expect(negateMod(-3n, 17n)).toBe(3n);
  });

  it("multiplies exactly modulo q", () => {
    expect(multiplyMod(7n, 8n, 17n)).toBe(5n);
    expect(multiplyMod(-2n, 3n, 17n)).toBe(11n);
    expect(multiplyMod(3328n, 3328n, 3329n)).toBe(1n);
  });

  it("performs modular exponentiation by repeated squaring", () => {
    expect(powerMod(2n, 0n, 17n)).toBe(1n);
    expect(powerMod(2n, 8n, 17n)).toBe(1n);
    expect(powerMod(-2n, 3n, 17n)).toBe(9n);
    expect(powerMod(999n, 2n, 2n)).toBe(1n);
  });

  it("supports arbitrary-size bigint values without number precision loss", () => {
    const q = 2n ** 200n + 235n;
    const value = 2n ** 250n + 13n;
    expect(normalizeMod(value, q)).toBe(value % q);
    expect(multiplyMod(value, value, q)).toBe((value * value) % q);
  });

  it("rejects invalid moduli", () => {
    expect(() => assertModulus(0n)).toThrow(/>= 2/);
    expect(() => assertModulus(1n)).toThrow(/>= 2/);
    expect(() => assertModulus(-3n)).toThrow(/>= 2/);
    expect(() => normalizeMod(1n, 0n)).toThrow(/>= 2/);
    expect(() => normalizeMod(1n, 17 as unknown as bigint)).toThrow(/bigint/);
  });

  it("rejects values that are not bigint at runtime", () => {
    expect(() => normalizeMod(1 as unknown as bigint, 17n)).toThrow(/bigint/);
    expect(() => addMod(1n, 2 as unknown as bigint, 17n)).toThrow(/bigint/);
    expect(() => multiplyMod(1n, 2n, 17 as unknown as bigint)).toThrow(
      /bigint/,
    );
    expect(() => powerMod(2n, -1n, 17n)).toThrow(/non-negative/);
  });
});
