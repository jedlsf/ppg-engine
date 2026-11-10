import { makeSlotId, SlotIndexingEngine } from "../../src/core/geometry/index.js";
import { createRingParameters, Polynomial, PolynomialState } from "../../src/core/polynomial/index.js";

export const TOY_RING = createRingParameters(17n, 4);

export function makeEngine(
  gridSizes: readonly number[] = [1],
): SlotIndexingEngine {
  return new SlotIndexingEngine(SlotIndexingEngine.createSpec(gridSizes));
}

export function makePolynomial(
  c0: bigint,
  c1 = 0n,
  c2 = 0n,
  c3 = 0n,
  ring = TOY_RING,
): Polynomial {
  return Polynomial.fromCoefficients(ring, [c0, c1, c2, c3]);
}

export function makeState(
  engine = makeEngine([1]),
  ring = TOY_RING,
): PolynomialState {
  return PolynomialState.fromInitializer(engine, ring, (slotId) => {
    const value = BigInt(Number(slotId) + 1);
    return Polynomial.fromCoefficients(ring, [
      value,
      BigInt((Number(slotId) * 2 + 1) % Number(ring.modulus)),
      0n,
      0n,
    ]);
  });
}

export function slot(index: number) {
  return makeSlotId(index);
}
