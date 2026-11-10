import { systemSpecKey } from "../geometry/index.js";
import { encodePolynomial, Polynomial, PolynomialState, ringParameterKey } from "../polynomial/index.js";

export interface PolynomialMultiplicity {
  /** Canonical JSON string, not a cryptographic hash. */
  readonly encodingKey: string;
  readonly count: number;
}

export interface StateComparison {
  readonly sameSystem: boolean;
  readonly sameRing: boolean;
  readonly sameSlotCount: boolean;
  /** True when the multiset of polynomial values is unchanged (slot order ignored). */
  readonly samePolynomialMultiset: boolean;
  /** True when the coefficient-wise sum across every slot is unchanged. */
  readonly sameAggregatePolynomial: boolean;
}

/** Sorted polynomial multiset representation, useful for research diagnostics. */
export function polynomialMultiset(
  state: PolynomialState,
): readonly PolynomialMultiplicity[] {
  assertState(state);
  const counts = new Map<string, number>();
  for (const polynomial of state.values) {
    const key = JSON.stringify(encodePolynomial(polynomial));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.freeze(
    [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([encodingKey, count]) => Object.freeze({ encodingKey, count })),
  );
}

export function samePolynomialMultiset(
  left: PolynomialState,
  right: PolynomialState,
): boolean {
  if (!(left instanceof PolynomialState) || !(right instanceof PolynomialState))
    return false;
  if (
    left.values.length !== right.values.length ||
    ringParameterKey(left.ring) !== ringParameterKey(right.ring)
  ) {
    return false;
  }
  const a = polynomialMultiset(left);
  const b = polynomialMultiset(right);
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        entry.encodingKey === other.encodingKey &&
        entry.count === other.count
      );
    })
  );
}

/** Sum all slot polynomials. This aggregate is invariant under slot permutations. */
export function aggregatePolynomial(state: PolynomialState) {
  assertState(state);
  let total = Polynomial.zero(state.ring);
  for (let index = 0; index < state.values.length; index += 1) {
    total = total.add(state.values[index]!);
  }
  return total;
}

export function compareStates(
  before: PolynomialState,
  after: PolynomialState,
): StateComparison {
  assertState(before);
  assertState(after);
  const sameSystem =
    systemSpecKey(before.engine) === systemSpecKey(after.engine);
  const sameRing =
    ringParameterKey(before.ring) === ringParameterKey(after.ring);
  const sameSlotCount = before.values.length === after.values.length;
  const compatible = sameSystem && sameRing && sameSlotCount;
  return Object.freeze({
    sameSystem,
    sameRing,
    sameSlotCount,
    samePolynomialMultiset: compatible && samePolynomialMultiset(before, after),
    sameAggregatePolynomial:
      compatible &&
      aggregatePolynomial(before).equals(aggregatePolynomial(after)),
  });
}

function assertState(state: PolynomialState): void {
  if (!(state instanceof PolynomialState))
    throw new TypeError("state must be a PolynomialState");
}
