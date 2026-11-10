# Layer 3 — Reversible Transformations

Layer 3 applies reversible operations to Layer 2 polynomial states while validating that every operation is bound to the same ordered geometry specification and polynomial ring.

## Modules

- `types.ts`: common transformation contract and context validation.
- `permutation-action.ts`: applies a Layer 1 global permutation to polynomial payloads.
- `ring-automorphism.ts`: applies substitutions (X \mapsto X^k) where (gcd(k,2n)=1).
- `coupling.ts`: applies the elementary shear (target' = target + a \cdot source).
- `composition.ts`: ordered transformation sequences and their inverses.
- `invariants.ts`: state comparison, polynomial multiset, and aggregate-polynomial diagnostics.

## Transformation semantics

### Permutation

A permutation moves complete polynomial payloads between slots. It preserves the polynomial multiset and coefficient-wise aggregate sum.

### Ring automorphism

The substitution (X \mapsto X^k) is valid when the canonical exponent is coprime to (2n). The inverse uses the multiplicative inverse of (k) modulo (2n).

### Polynomial coupling

For distinct source and target slots, the operation is:

```text
target' = target + coefficient * source
source' = source
```

Its inverse applies the negated coefficient. The coefficient does not need to be a unit because the source value is unchanged.

### Composition

A `TransformationSequence` executes steps in array order. Its inverse reverses the order and inverts each step. The sequence validates all steps before it is applied.

## Example

```ts
import { PPGEngine, Polynomial, makeSlotId } from "ppg-engine";

const engine = new PPGEngine({
  cubes: [1],
  ring: { modulus: 17n, degree: 4 },
});

engine.applyCoupling(
  makeSlotId(0),
  makeSlotId(1),
  Polynomial.one(engine.ring),
);
engine.undo();
```

These operations are reversible algebraic transformations. They are not, by themselves, cryptographic primitives and do not establish computational hardness or security.
