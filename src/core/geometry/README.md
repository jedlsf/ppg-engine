# Layer 1 — Geometry

Layer 1 defines the canonical facelet address space and the geometric operations that act on it.

## Modules

- `types.ts`: branded cube/slot identifiers, face IDs, and validated data types.
- `indexing.ts`: immutable cube-system specifications and coordinate/slot conversion.
- `surface.ts`: face-local coordinates, 3D positions, and outward normals.
- `permutation.ts`: validated permutations, inverse, composition, and payload application.
- `moves.ts`: slice and face-turn permutations.
- `placement.ts`: lattice placement and the 24 proper cube orientations.
- `topology.ts`: cube-network construction and inferred face adjacency.
- `connections.ts`: oriented face-cell correspondence for adjacent cubes.
- `global-moves.ts`: global face-exchange permutations and helpers.

## Canonical slot order

Cubes follow the order of `SystemSpec.cubes`. Within each cube, faces follow `UP`, `DOWN`, `LEFT`, `RIGHT`, `FRONT`, `BACK`; within each face, `u` is the row and `v` is the column. The face-local index is `u * gridSize + v`.

Each cube with grid size (N) contributes (6N^2) slots. A slot is a facelet address, not a physically constrained cubie. The model does not enforce every legal Rubik's Cube reachability constraint.

## Example

```ts
import { FaceId, PPGEngine, makeCubeId } from "ppg-engine";

const engine = new PPGEngine({
  cubes: [3],
  ring: { modulus: 17n, degree: 4 },
});

const slot = engine.geometry.coordinateToSlotId({
  cubeId: makeCubeId(0),
  faceId: FaceId.FRONT,
  u: 1,
  v: 2,
});
console.log(Number(slot));
```

Layer 1 is payload-agnostic. It can be used independently of the polynomial and transformation layers.
