import { describe, expect, it } from "vitest";
import {
  MAX_SUPPORTED_INPUT_COEFFICIENTS,
  MAX_SUPPORTED_STATE_COEFFICIENTS,
  Polynomial,
  PolynomialState,
  SlotIndexingEngine,
  createRingParameters,
  decodePolynomial,
  encodePolynomial,
} from "../../src/index.js";

describe("Layer 2 adversarial input validation and algebraic integration", () => {
  const ring = createRingParameters(17n, 4);

  it("rejects sparse coefficient arrays in reducing and canonical constructors", () => {
    const sparse = new Array<bigint>(4);
    expect(() => Polynomial.fromCoefficients(ring, sparse)).toThrow(/sparse/);
    expect(() => Polynomial.fromCanonicalCoefficients(ring, sparse)).toThrow(/sparse/);
  });

  it("rejects coefficient accessor properties without executing the getter", () => {
    const coefficients = [0n, 1n, 2n, 3n];
    Object.defineProperty(coefficients, "0", {
      configurable: true,
      get() {
        throw new Error("getter must not execute");
      },
    });
    expect(() => Polynomial.fromCanonicalCoefficients(ring, coefficients)).toThrow(/data property/);
  });

  it("caps reducing constructor input length", () => {
    const oversized = Array<bigint>(MAX_SUPPORTED_INPUT_COEFFICIENTS + 1).fill(0n);
    expect(() => Polynomial.fromCoefficients(ring, oversized)).toThrow(/supported limit/);
  });

  it("rejects ring-parameter objects with inherited state or accessors", () => {
    const inherited = Object.assign(Object.create({ polluted: true }), {
      modulus: 17n,
      degree: 4,
      quotient: "x^n+1",
    });
    expect(() => Polynomial.zero(inherited as never)).toThrow(/plain data object/);

    const accessor = Object.defineProperty(
      { degree: 4, quotient: "x^n+1" },
      "modulus",
      { get: () => 17n },
    );
    expect(() => Polynomial.zero(accessor as never)).toThrow(/own data property/);
  });

  it("rejects serialized polynomial objects with unexpected prototypes and symbols", () => {
    const valid = encodePolynomial(Polynomial.one(ring));
    const inherited = Object.assign(Object.create({ extra: true }), valid);
    expect(() => decodePolynomial(ring, inherited)).toThrow(/plain data object/);

    const withSymbol = { ...valid, [Symbol("untrusted")]: "value" };
    expect(() => decodePolynomial(ring, withSymbol)).toThrow(/symbol/);
  });

  it("rejects accessor-backed encoding properties without invoking them", () => {
    const valid = encodePolynomial(Polynomial.one(ring));
    const payload = { ...valid };
    Object.defineProperty(payload, "format", {
      enumerable: true,
      get() {
        throw new Error("getter must not execute");
      },
    });
    expect(() => decodePolynomial(ring, payload)).toThrow(/data property/);
  });

  it("rejects oversized decimal strings before BigInt parsing", () => {
    const valid = encodePolynomial(Polynomial.one(ring));
    const payload = {
      ...valid,
      coefficients: ["9".repeat(100_000), "0", "0", "0"],
    };
    expect(() => decodePolynomial(ring, payload)).toThrow(/outside/);
  });

  it("rejects a sparse encoded coefficient array", () => {
    const valid = encodePolynomial(Polynomial.one(ring));
    const coefficients = new Array<string>(4);
    coefficients[0] = "1";
    expect(() => decodePolynomial(ring, { ...valid, coefficients })).toThrow(/sparse/);
  });

  it("enforces a combined dense state allocation budget before allocation", () => {
    const geometry = new SlotIndexingEngine(SlotIndexingEngine.createSpec([64]));
    const largeRing = createRingParameters(17n, 16);
    expect(geometry.spec.totalSlots * largeRing.degree).toBeGreaterThan(MAX_SUPPORTED_STATE_COEFFICIENTS);
    expect(() => PolynomialState.zero(geometry, largeRing)).toThrow(/supported limit/);
  });

  it("requires a real geometry engine when constructing polynomial state", () => {
    expect(() => PolynomialState.zero({ spec: { totalSlots: 0, cubes: [] } } as never, ring)).toThrow(/SlotIndexingEngine/);
  });

  it("rejects sparse state value arrays", () => {
    const geometry = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1]));
    expect(() => PolynomialState.fromValues(geometry, ring, new Array(6) as Polynomial[])).toThrow(/sparse/);
  });

  it("keeps an original state unchanged when a mapper throws partway through", () => {
    const geometry = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1]));
    const original = PolynomialState.zero(geometry, ring);
    let calls = 0;
    expect(() => original.mapValues(() => {
      calls += 1;
      if (calls === 3) throw new Error("caller mapper failed");
      return Polynomial.one(ring);
    })).toThrow("caller mapper failed");
    expect(original.values.every((value) => value.isZero())).toBe(true);
  });

  it("preserves canonical decode/encode round trips for ordinary payloads", () => {
    const polynomial = Polynomial.fromCoefficients(ring, [-1n, 19n, 3n, 0n]);
    expect(decodePolynomial(ring, JSON.parse(JSON.stringify(polynomial)))).toEqual(polynomial);
  });

  it("bounds extremely large polynomial exponents", () => {
    const exponent = 1n << 4_096n;
    expect(() => Polynomial.one(createRingParameters(17n, 1)).power(exponent)).toThrow(/processing limit/);
  });

  it("retains exact results for large but supported scalar inputs", () => {
    const polynomial = Polynomial.fromCoefficients(ring, [16n, 1n, 0n, 0n]);
    expect(polynomial.add(Polynomial.one(ring)).coefficients).toEqual([0n, 1n, 0n, 0n]);
    expect(polynomial.scale(17n ** 20n + 3n).coefficient(0)).toBe(14n);
  });
});
