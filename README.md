# Polynomial Permutation Geometry (PPG) Engine

**PPG** stands for **Polynomial Permutation Geometry**—the three ideas the engine brings together:

- **Geometry** describes cube facelets: their coordinates, orientations, and how faces connect across placed cubes.
- **Polynomials** are exact, modular values stored in those facelet positions.
- **Permutations and transformations** rearrange or algebraically change those values in explicit, reversible ways.

In everyday terms, PPG Engine is a TypeScript library for representing the state of one or more cube surfaces and changing that state in well-defined ways. Each small square on a cube face (a *facelet*) is a position that can hold a polynomial value. The engine provides cube-aware indexing and moves, polynomial operations, and undo/redo.

It is a building block for TypeScript projects such as cube-based puzzle or game mechanics, teaching or exploring polynomial arithmetic and reversible transformations, and experiments that can be represented on cube facelets. It does **not** model arbitrary spatial grids or domain-specific objects directly; applications that use it for another kind of problem must map that problem onto its cube-facelet model. It is not a finished game, visual interface, physics simulator, or industry-specific application.

The source is organized into three layers:

| Layer | Responsibility |
|---|---|
| **Layer 1 — Geometry** | Cube facelet slots and indexing, coordinates, orientations, cube placement and adjacency, and validated permutations |
| **Layer 2 — Polynomial state** | Exact arithmetic in (R_q = \mathbb{Z}_q[X]/(X^n + 1)), immutable polynomials, and one polynomial value per facelet slot |
| **Layer 3 — Transformations** | Applying slot permutations, polynomial coupling, ring automorphisms, and ordered reversible composition to a polynomial state |

The public entry point is the `PPGEngine` class. It combines the geometry and polynomial configuration, maintains the current state, applies transformations, and provides undo/redo and diagnostics. The lower-level geometry, polynomial, and transformation modules can also be used independently.

> **Scope:** PPG Engine is a mathematical state and transformation engine. It is not an encryption, key-generation, key-exchange, or digital-signature implementation. It makes no cryptographic or post-quantum security claim. JavaScript `BigInt` arithmetic is not guaranteed to be constant-time.

## Installation

To build and use a local checkout, clone the repository, then run these commands from its root:

```bash
npm install
npm run build
```

To use a built local checkout from another project, install it by path (replace the path with the location of your checkout):

```bash
npm install ../ppg-engine
```

Once the package is published to npm, install it by name:

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

The order of the cube array determines canonical slot offsets. Each cube contributes (6N^2) facelet slots for grid size (N). This configuration defines the cubes and their slots; it does not place the cubes in relation to one another.

To model a cube arrangement and find adjacent faces, use the geometry module's `createCubeNetwork()` with a placement and orientation for each cube. Grid size sets the number of facelets on each edge, not the cubes' physical size. Face exchange is supported for connected faces with matching resolutions; the engine does not resample different resolutions.

### Polynomial ring

The engine uses:

[
R_q = \mathbb{Z}_q[X]/(X^n + 1)
]

where `modulus` is (q) and `degree` is (n). Coefficients are `bigint` values normalized to the canonical range ([0, q-1]). Polynomial coefficients are stored in ascending-degree order.

The modulus must be at least 2 and may be composite; the degree must be a positive integer within the implementation limit.

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

The `PPGEngine` façade also provides these more general operations:

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


## What you can build with it

The repository supplies reusable primitives, not prebuilt applications or integrations. Its most direct uses are:

- Cube-based puzzles and game mechanics that need facelet state, face turns, slice moves, or undo/redo.
- Examples and experiments that combine modular polynomial arithmetic with structured state changes.
- Prototypes whose data can be deliberately mapped to cube facelets and benefit from validated, reversible transformations.

The source code does not include industry-specific data models, physics or domain calculations, visualization, persistence, networking, or application workflows. Those must be supplied by the consuming application; mapping a problem onto facelets does not by itself make the engine a domain solution.

### 25 use cases across sectors and industries

PPG Engine provides reusable geometry, polynomial-state, and reversible-transformation primitives. The following are illustrative application patterns, not ready-made sector applications. Each production adoption still needs domain-specific validation, data models, performance testing, and applicable regulatory controls.

| # | Sector / industry | Example use case | Potential benefit from PPG Engine |
|---:|---|---|---|
| 1 | Advanced manufacturing | Model component positions and process states across modular production cells. | A consistent slot model and reversible state changes make process simulations easier to reproduce. |
| 2 | Robotics | Prototype discrete end-effector, workspace, or puzzle-like motion states. | Geometry-based permutations provide explicit, testable state transitions for simulation prototypes. |
| 3 | Automotive engineering | Model vehicle subsystem configurations and discrete sensor/layout states. | Common coordinate indexing helps compare configurations and replay transformations. |
| 4 | Aerospace simulation | Represent modular spacecraft or aircraft subsystem states in a simulator. | Ordered topology and deterministic transformations support repeatable simulation experiments; not flight-control software. |
| 5 | Supply chain and logistics | Represent warehouse, hub, and route-node states with adjacency relationships. | State changes can be applied and reversed to compare routing or allocation scenarios. |
| 6 | Warehousing | Model bin occupancy, storage zones, and slot reassignment. | Canonical slots and permutation operations make reorganization scenarios explicit. |
| 7 | Construction and BIM | Prototype modular building-component adjacency and configuration states. | Orientation-aware connections help reason about neighboring modules and compatible layouts. |
| 8 | Architecture and CAD research | Explore transformations of discretized design surfaces and modular forms. | A shared geometry model provides repeatable coordinate mappings and reversible edits. |
| 9 | Game development | Build puzzle mechanics, board states, cube worlds, or deterministic game simulations. | Face turns, slice moves, custom state initialization, undo, and redo reduce bespoke state-engine code. |
| 10 | STEM education | Teach modular arithmetic, quotient rings, permutations, and reversible functions. | The layers make the relationship between geometry, algebra, and transformations inspectable. |
| 11 | Scientific computing | Prototype deterministic pipelines over structured polynomial-valued state arrays. | Immutable state snapshots and ordered transformation sequences improve experiment reproducibility. |
| 12 | Materials science | Explore small lattice and unit-cell configuration models. | Explicit coordinate and orientation transforms support repeatable discrete-state experiments. |
| 13 | Chemistry research | Prototype coarse-grained configuration-state transitions for teaching or exploratory tooling. | Reversible transformations help compare model states; the engine does not calculate chemical properties. |
| 14 | Bioinformatics | Represent tiled feature windows or discrete sequence annotations in a structured state model. | Canonical indexing and polynomial payloads provide a consistent substrate for custom research code. |
| 15 | Medical imaging research | Experiment with labeled tile or voxel-region arrangements in non-clinical prototypes. | Stable indexing and transformations help reproduce data-layout experiments; not for diagnosis or treatment decisions. |
| 16 | Energy systems | Model discrete states of grid zones, substations, or modular network layouts. | Topology-aware adjacency and reversible changes support planning simulations. |
| 17 | Telecommunications | Prototype network-node layouts, link adjacency, and configuration changes. | Ordered topology and state transformations make network scenarios easier to compare. |
| 18 | Data centers | Model rack, cabinet, and equipment-slot layouts with placement constraints. | Canonical slot ranges and adjacency maps help simulate equipment moves and reconfiguration. |
| 19 | Precision agriculture | Represent field zones, sensor regions, or irrigation-cell configurations. | Grid-indexed state updates can support repeatable spatial planning prototypes. |
| 20 | Environmental science | Build discrete state models over tiled environmental regions. | Transformations and immutable snapshots make scenario comparisons reproducible. |
| 21 | GIS and geospatial research | Prototype local tile, zone, and adjacency operations. | Coordinate-to-slot bijections simplify repeatable transformations over discretized regions. |
| 22 | Finance and risk analytics | Explore discrete portfolio, allocation, or stress-scenario states. | Reversible state updates make scenario branches easier to replay; this is not a pricing or advisory engine. |
| 23 | Insurance operations | Prototype claim-workflow state transitions and scenario comparisons. | A consistent state model and bounded undo history help make process simulations auditable. |
| 24 | Retail and merchandising | Model shelf, planogram, or inventory-location rearrangements. | Permutations and state snapshots support reversible layout and stock-placement experiments. |
| 25 | Records and digital provenance | Model document lifecycle metadata, version relationships, or workflow state. | Deterministic state transformations help compare and replay metadata changes; the engine does not sign or authenticate records. |

## Resource limits and defensive input handling

The runtime validates public inputs even when TypeScript types have been bypassed by JavaScript callers or deserialized data. It rejects malformed IDs, invalid face normals, sparse arrays, non-canonical polynomial encodings, forged permutation structures, incompatible states, and malformed transformation contracts.

To avoid unbounded allocations from caller-controlled dimensions, the current implementation enforces these engineering limits:

| Resource | Supported limit |
|---|---:|
| Cube instances in one system | 4,096 |
| Grid edge length per cube | 128 |
| Total facelet slots per geometry system | 100,000 |
| Polynomial degree | 4,096 |
| Dense polynomial-state coefficients (slots × degree) | 262,144 |
| Coefficients in one polynomial-construction input | 65,536 |
| Transformations in one sequence | 10,000 |
| Retained engine history | 1,000 by default; configurable up to 10,000 (0 disables history) |
| Modulus bit length | 4,096 |

These are implementation/resource limits, not mathematical or cryptographic parameters. Limits apply together: for example, the slot count multiplied by the polynomial degree must also stay within the dense-state coefficient limit, so the individual maxima cannot all be combined. An application should set lower limits appropriate to its runtime and workload. BigInt arithmetic and user-supplied callbacks execute in-process; callbacks are not sandboxed, and exceptions thrown by a callback are intentionally propagated. The engine keeps the previous state unchanged when a state initialization or transformation fails before commit. No library can guarantee immunity to every process-level failure, runtime bug, or hostile code already executing with the caller's privileges.

## Test coverage

The test suite is organized by layer and includes both focused unit tests and multi-layer integration tests:

| Suite | Coverage |
|---|---|
| tests/geometry | Canonical indexing, surface coordinates, permutations, moves, orientations, topology, face connections, global exchanges, bounds, and malformed inputs |
| tests/polynomial | Modular arithmetic, ring parameters, canonical construction, arithmetic laws, encoding/decoding, immutable state, allocation limits, and adversarial inputs |
| tests/transform | Permutation actions, ring automorphisms, coupling, invariants, composition order, inverse behavior, incompatible contexts, and invalid custom transformations |
| tests/engine | Engine state lifecycle, operation history, undo/redo, bounded history, and end-to-end façade behavior |
| tests/integration | Cross-layer topology → state → transformation workflows, including inverse/replay behavior |

Run the complete verification locally with npm run check, or run targeted suites with npm run test:geometry, npm run test:polynomial, npm run test:transform, npm run test:engine, npm run test:integration, and npm run test:security.

## Model boundaries

- Geometry describes facelet slots and validated permutations. It does not enforce every reachability constraint of a physical Rubik's Cube.
- Different-resolution face connections are reported explicitly; the engine does not invent interpolation or resampling semantics.
- Polynomial operations use exact `BigInt` arithmetic, not an optimized NTT implementation.
- Reversible transformations are algebraic operations, not evidence of computational hardness or cryptographic security.
- No DSA, signature, key-generation, KEM, or candidate-selection code is included.

## License

**License:** [MIT](LICENSE) — free for personal and commercial use.

## Author

Developed by **Josef Elijah Fabian (Zelijah)** | [Zelijah](https://thezelijah.world)

**Developer**: [Josef Elijah Fabian](https://github.com/jedlsf)

**GitHub**: [https://github.com/jedlsf](https://github.com/jedlsf)

**Project Repository**: [https://github.com/jedlsf/ppg-engine](https://github.com/jedlsf/ppg-engine)

---

## Contact

- **Business Email**: [business@majikah.solutions](mailto:business@majikah.solutions)
- **Official Website**: [https://www.thezelijah.world](https://www.thezelijah.world)