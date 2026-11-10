# PPG Engine

**PPG Engine** is a TypeScript engine for building and transforming structured polynomial states over cube-based geometry.

It consolidates the reusable first three layers of the former Majik Rubik research project into one usable library:

| Layer | Responsibility |
|---|---|
| **Layer 1 — Geometry** | Cube systems, canonical facelet slots, coordinates, orientations, topology, adjacency, and permutations |
| **Layer 2 — Polynomial state** | Exact arithmetic in (R_q = \mathbb{Z}_q[X]/(X^n + 1)), immutable polynomials, and state assignment |
| **Layer 3 — Transformations** | Reversible slot permutations, polynomial coupling, ring automorphisms, and ordered composition |

The public entry point is the `PPGEngine` class. It owns the geometry and polynomial configuration, maintains the current state, applies Layer 3 transformations, and provides undo/redo and diagnostics.

> **Scope:** PPG Engine is a mathematical state and transformation engine. It is not an encryption, key-generation, key-exchange, or digital-signature implementation. It makes no cryptographic or post-quantum security claim. JavaScript `BigInt` arithmetic is not guaranteed to be constant-time.

## Installation

Install from the repository while the package is being prepared for publication:

```bash
npm install
npm run build
```

Once published, the package will be installable as:

```bash
npm install ppg-engine
```

## Quick start

Create an engine with one cube whose six faces each contain a 2 × 2 grid, and a small polynomial ring suitable for experimentation:

```ts
import { FaceId, PPGEngine, Polynomial, makeCubeId } from "ppg-engine";

const engine = new PPGEngine({
  cubes: [2],                 // grid sizes; generated cube IDs start at 0
  ring: {
    modulus: 17n,
    degree: 4,                // R_17 = Z_17[X] / (X^4 + 1)
  },
});

const ring = engine.ring;
engine.setPolynomial(
  0,
  Polynomial.fromCoefficients(ring, [1n, 2n, 0n, 0n]),
);

// Positive turns are clockwise when viewed from outside the selected face.
engine.applyFaceTurn({
  cubeId: makeCubeId(0),
  faceId: FaceId.FRONT,
  quarterTurns: 1,
});

console.log(engine.getPolynomial(0).coefficients);
console.log(engine.getDiagnostics());

engine.undo(); // restore the state before the face turn
engine.redo(); // reapply it
```

## Configuration

### Cube system

For the shorthand configuration, `cubes` is an array of positive grid sizes. Each element creates one cube, with IDs assigned by array order:

```ts
const engine = new PPGEngine({
  cubes: [3, 4, 2],
  ring: { modulus: 257n, degree: 8 },
});
```

For explicit, non-contiguous IDs, use `CubeConfig` objects and `makeCubeId()`:

```ts
import { PPGEngine, makeCubeId } from "ppg-engine";

const engine = new PPGEngine({
  cubes: [
    { id: makeCubeId(7), gridSize: 2 },
    { id: makeCubeId(42), gridSize: 3 },
  ],
  ring: { modulus: 257n, degree: 8 },
});
```

The order of the cube array determines canonical slot offsets. Each cube contributes (6N^2) slots for its grid size (N).

### Polynomial ring

The engine uses:

[
R_q = \mathbb{Z}_q[X]/(X^n + 1)
]

where `modulus` is (q) and `degree` is (n). Coefficients are `bigint` values normalized to the canonical range ([0, q-1]). Polynomial coefficients are stored in ascending-degree order.

## Working with state

`PPGEngine` initializes every slot with the zero polynomial unless an initializer is supplied.

```ts
import { PPGEngine, Polynomial } from "ppg-engine";

const engine = new PPGEngine({
  cubes: [2],
  ring: { modulus: 17n, degree: 4 },
  initialize: (_slotId, coordinate) =>
    Polynomial.fromCoefficients(
      { modulus: 17n, degree: 4, quotient: "x^n+1" },
      [BigInt(coordinate.faceId + 1)],
    ),
});

// Read or replace a value by canonical global slot ID.
const value = engine.getPolynomial(0);
engine.setPolynomial(1, value);

// A flattened snapshot contains totalSlots * degree coefficients.
const coefficients = engine.getStateCoefficients();
engine.setStateCoefficients(coefficients);
```

The `state` getter exposes the current immutable `PolynomialState`. Use `setState()` to load a compatible state and make it the new reset baseline, or `initialize()` to create a new baseline from a callback.

## Transformations

All operations below update the engine state only after the transformation has validated and completed successfully.

```ts
import {
  FaceId,
  PPGEngine,
  Polynomial,
  makeCubeId,
  makeSlotId,
} from "ppg-engine";

const engine = new PPGEngine({
  cubes: [2],
  ring: { modulus: 17n, degree: 4 },
});

engine.applyFaceTurn({
  cubeId: makeCubeId(0),
  faceId: FaceId.FRONT,
  quarterTurns: 1,
});

engine.applySliceMove({
  cubeId: makeCubeId(0),
  axis: "y",
  layer: 0,
  quarterTurns: -1,
});

engine.applyCoupling(
  makeSlotId(0),
  makeSlotId(1),
  Polynomial.one(engine.ring),
);

engine.applyRingAutomorphism(3); // X -> X^3; requires gcd(3, 2 * degree) = 1
engine.undo();
engine.redo();
```

The lower-level modules are also available directly:

- `PPGEngine.applyPermutation()` applies a validated global permutation.
- `PPGEngine.applyFaceExchange()` exchanges matching payloads across a resolved cube-face connection.
- `PPGEngine.applyTransformation()` applies one custom Layer 3 transformation.
- `PPGEngine.applySequence()` applies an ordered transformation sequence atomically.

## Public API

`PPGEngine` exposes:

| API | Purpose |
|---|---|
| `geometry`, `systemSpec`, `ring` | Read-only engine configuration |
| `state`, `totalSlots` | Current state and slot count |
| `initialize()`, `setState()`, `reset()` | State lifecycle |
| `getPolynomial()`, `setPolynomial()` | Read or update one slot |
| `getStateCoefficients()`, `setStateCoefficients()` | Flattened state interchange |
| `applyFaceTurn()`, `applySliceMove()`, `applyPermutation()` | Geometry-driven rearrangement |
| `applyFaceExchange()` | Inter-cube payload exchange |
| `applyCoupling()`, `applyRingAutomorphism()` | Polynomial transformations |
| `applyTransformation()`, `applySequence()` | Generic transformation interface |
| `undo()`, `redo()`, `getHistory()` | Operation timeline |
| `getDiagnostics()` | Configuration and history diagnostics |

Import lower-level functionality from the package root or the `ppg-engine/geometry`, `ppg-engine/polynomial`, and `ppg-engine/transform` subpaths.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The test suite intentionally covers the retained Layers 1–3 only:

```bash
npm run test:geometry
npm run test:polynomial
npm run test:transform
npm run test:engine
```

## Model boundaries

- Geometry describes facelet slots and validated permutations. It does not enforce every reachability constraint of a physical Rubik's Cube.
- Different-resolution face connections are reported explicitly; the engine does not invent interpolation or resampling semantics.
- Polynomial operations use exact `BigInt` arithmetic, not an optimized NTT implementation.
- Reversible transformations are algebraic operations, not evidence of computational hardness or cryptographic security.
- No DSA, signature, key-generation, KEM, or candidate-selection code is included.

## License

Apache-2.0. See [LICENSE](./LICENSE).
