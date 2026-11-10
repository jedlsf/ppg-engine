import { FaceId, makeCubeId } from './types.js';
import type { CubeId } from './types.js';
import type { SlotIndexingEngine } from './indexing.js';
import type { FaceNormal } from './surface.js';
import {
  createLatticePosition,
  isCubeOrientationId,
  localFaceForWorldNormal,
  worldNormalForFace,
  type CubePlacement,
  type LatticePosition,
} from './placement.js';

export interface FaceAdjacency {
  /** Canonical endpoint A follows the cube order in SystemSpec. */
  readonly cubeA: CubeId;
  readonly faceA: FaceId;
  readonly cubeB: CubeId;
  readonly faceB: FaceId;
  /** Outward normal from cube A toward cube B, expressed in world axes. */
  readonly worldNormalFromA: FaceNormal;
}

export interface CubeNetwork {
  /** Stable compatibility key for the ordered cube IDs and grid sizes in the source SystemSpec. */
  readonly systemKey: string;
  /** Placements normalized into SystemSpec cube order. */
  readonly placements: readonly CubePlacement[];
  /** Face adjacencies inferred from integer spatial placements. */
  readonly connections: readonly FaceAdjacency[];
}

const WORLD_DIRECTIONS: readonly FaceNormal[] = Object.freeze([
  Object.freeze({ x: 0, y: 1, z: 0 }),
  Object.freeze({ x: 0, y: -1, z: 0 }),
  Object.freeze({ x: -1, y: 0, z: 0 }),
  Object.freeze({ x: 1, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: 1 }),
  Object.freeze({ x: 0, y: 0, z: -1 }),
]);

/** Stable structural key for checking that a network is used with its source system spec. */
export function systemSpecKey(engine: SlotIndexingEngine): string {
  return `ppc-layer1-v1|${engine.spec.cubes.map((cube) => `${cube.id}:${cube.gridSize}`).join('|')}`;
}

function positionKey(position: LatticePosition): string {
  return `${position.x},${position.y},${position.z}`;
}

function sameNormal(a: FaceNormal, b: FaceNormal): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function addDirection(position: LatticePosition, direction: FaceNormal): LatticePosition | undefined {
  const next = { x: position.x + direction.x, y: position.y + direction.y, z: position.z + direction.z };
  if (![next.x, next.y, next.z].every(Number.isSafeInteger)) return undefined;
  return next;
}

function oppositeNormal(normal: FaceNormal): FaceNormal {
  return Object.freeze({ x: -normal.x as -1 | 0 | 1, y: -normal.y as -1 | 0 | 1, z: -normal.z as -1 | 0 | 1 });
}

/** Create a validated, immutable placement record. */
export function createCubePlacement(input: CubePlacement): CubePlacement {
  if (input === null || typeof input !== 'object') throw new TypeError('CubePlacement must be an object');
  const cubeId = makeCubeId(input.cubeId as number);
  if (!isCubeOrientationId(input.orientation)) {
    throw new RangeError(`Invalid CubeOrientationId: ${String(input.orientation)}`);
  }
  const position = createLatticePosition(input.position);
  return Object.freeze({ cubeId, position, orientation: input.orientation });
}

/**
 * Build a spatial network for the given system.
 *
 * Each cube occupies one integer lattice cell regardless of its face grid size.
 * Two cubes are adjacent when their lattice positions differ by exactly one
 * on a single world axis. Every cube in the SystemSpec must have one placement.
 * The grid size controls facelet resolution, not physical cube size.
 */
export function createCubeNetwork(
  engine: SlotIndexingEngine,
  inputPlacements: readonly CubePlacement[],
): CubeNetwork {
  if (!Array.isArray(inputPlacements)) throw new TypeError('placements must be an array');
  if (inputPlacements.length !== engine.spec.cubes.length) {
    throw new RangeError(
      `Expected ${engine.spec.cubes.length} placements, received ${inputPlacements.length}`,
    );
  }

  const placementById = new Map<CubeId, CubePlacement>();
  const byPosition = new Map<string, CubePlacement>();
  for (const input of inputPlacements) {
    const placement = createCubePlacement(input);
    // getCube verifies that the ID is actually part of the current SystemSpec.
    engine.getCube(placement.cubeId);
    if (placementById.has(placement.cubeId)) {
      throw new Error(`Duplicate placement for CubeId ${placement.cubeId}`);
    }
    const key = positionKey(placement.position);
    const occupying = byPosition.get(key);
    if (occupying) {
      throw new Error(
        `Overlapping cube placements: CubeId ${occupying.cubeId} and CubeId ${placement.cubeId} occupy (${key})`,
      );
    }
    placementById.set(placement.cubeId, placement);
    byPosition.set(key, placement);
  }

  for (const cube of engine.spec.cubes) {
    if (!placementById.has(cube.id)) {
      throw new Error(`Missing placement for CubeId ${cube.id}`);
    }
  }

  const placements = engine.spec.cubes.map((cube) => placementById.get(cube.id)!);
  const order = new Map<CubeId, number>(placements.map((p, index) => [p.cubeId, index]));
  const connections: FaceAdjacency[] = [];

  for (const placementA of placements) {
    for (const worldNormal of WORLD_DIRECTIONS) {
      const neighborPosition = addDirection(placementA.position, worldNormal);
      if (!neighborPosition) continue;
      const placementB = byPosition.get(positionKey(neighborPosition));
      if (!placementB) continue;
      if (order.get(placementA.cubeId)! >= order.get(placementB.cubeId)!) continue;

      const faceA = localFaceForWorldNormal(placementA.orientation, worldNormal);
      const opposite = oppositeNormal(worldNormal);
      const faceB = localFaceForWorldNormal(placementB.orientation, opposite);

      // Sanity check the two chosen local faces are opposite in world space.
      const actualA = worldNormalForPlacementFace(placementA, faceA);
      const actualB = worldNormalForPlacementFace(placementB, faceB);
      if (!sameNormal(actualA, worldNormal) || !sameNormal(actualB, opposite)) {
        throw new Error('Internal topology invariant failed: connected face normals are not opposed');
      }

      connections.push(Object.freeze({
        cubeA: placementA.cubeId,
        faceA,
        cubeB: placementB.cubeId,
        faceB,
        worldNormalFromA: worldNormal,
      }));
    }
  }

  return Object.freeze({
    systemKey: systemSpecKey(engine),
    placements: Object.freeze(placements),
    connections: Object.freeze(connections),
  });
}

function worldNormalForPlacementFace(placement: CubePlacement, faceId: FaceId): FaceNormal {
  // Kept as a small private helper so topology's invariant stays explicit.
  return worldNormalForFace(placement.orientation, faceId);
}

/** Find a placement by CubeId in a previously validated network. */
export function getCubePlacement(network: CubeNetwork, cubeId: CubeId): CubePlacement {
  const placement = network.placements.find((entry) => entry.cubeId === cubeId);
  if (!placement) throw new Error(`No placement for CubeId ${cubeId}`);
  return placement;
}
