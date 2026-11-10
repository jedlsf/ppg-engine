# Layer 2 — Polynomial State

Layer 2 provides exact polynomial arithmetic over the quotient ring

```text
R_q = Z_q[X] / (X^n + 1)
```

and an immutable `PolynomialState` that stores one polynomial value per Layer 1 global slot.

## Modules

- `modular.ts`: exact modular arithmetic over `bigint`.
- `parameters.ts`: validated, immutable ring parameters.
- `polynomial.ts`: canonical polynomial construction, arithmetic, and encoding.
- `state.ts`: immutable slot-indexed polynomial state and persistent updates.

## Conventions

- `q` must be an integer modulus represented as a `bigint`, with (q \ge 2).
- The degree (n) is a positive safe integer subject to the implementation cap.
- Coefficients are stored in ascending-degree order and normalized to ([0,q-1]).
- Powers are reduced using (X^n=-1).

## Example

```ts
import { createRingParameters, Polynomial } from "ppg-engine/polynomial";

const ring = createRingParameters(17n, 4);
const x = Polynomial.monomial(ring, 1n, 1);
const x4 = x.power(4n);
console.log(x4.coefficients); // [16n, 0n, 0n, 0n]
```

`BigInt` arithmetic is exact but is not guaranteed to be constant-time. This module is general mathematical/reference code, not a cryptographic implementation.
