import { FaceId, isFaceId, makeSlotId } from './types.js';
import type { Coordinate, CubeId, SlotId } from './types.js';
import type { SlotIndexingEngine } from './indexing.js';
import {
  coordinateToSurfaceAddress,
  normalForFace,
  type FaceNormal,
  type GridPosition,
} from './surface.js';
import { transformGridPosition, transformNormal } from './placement.js';
import { createCubeNetwork, systemSpecKey } from './topology.js';
import type { FaceAdjacency, CubeNetwork } from './topology.js';

/**
 * Describe the face cell pair API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export interface FaceCellPair {
  readonly slotA: SlotId;
  readonly slotB: SlotId;
}

/**
 * Describe the face connection mapping status API.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export type FaceConnectionMappingStatus = 'bijective' | 'different-resolution';

/**
 * Resolved view of one physical face adjacency. `pairs` contains a full
 * one-to-one cell correspondence only when both connected faces have the
 * same grid size. Different-resolution connections are represented explicitly
 * with an empty mapping; no implicit resampling is performed.
 */
export interface ResolvedFaceConnection extends FaceAdjacency {
  /** Compatibility key ties this mapping to the SystemSpec used to build it. */
  readonly systemKey: string;
  readonly gridSizeA: number;
  readonly gridSizeB: number;
  readonly mappingStatus: FaceConnectionMappingStatus;
  readonly pairs: readonly FaceCellPair[];
}

function sameNormal(a: FaceNormal, b: FaceNormal): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function opposite(normal: FaceNormal): FaceNormal {
  return { x: -normal.x as -1 | 0 | 1, y: -normal.y as -1 | 0 | 1, z: -normal.z as -1 | 0 | 1 };
}

function tangentialKey(position: GridPosition, normal: FaceNormal): string {
  const components: number[] = [];
  if (normal.x === 0) components.push(position.x);
  if (normal.y === 0) components.push(position.y);
  if (normal.z === 0) components.push(position.z);
  return components.join(',');
}

function faceCoordinates(
  engine: SlotIndexingEngine,
  cubeId: CubeId,
  faceId: FaceId,
): Coordinate[] {
  const n = engine.getCube(cubeId).gridSize;
  const coordinates: Coordinate[] = [];
  for (let u = 0; u < n; u += 1) {
    for (let v = 0; v < n; v += 1) {
      coordinates.push({ cubeId, faceId, u, v });
    }
  }
  return coordinates;
}

function findNetworkAdjacency(network: CubeNetwork, candidate: FaceAdjacency): FaceAdjacency {
  const adjacency = network.connections.find((entry) =>
    entry.cubeA === candidate.cubeA && entry.faceA === candidate.faceA &&
    entry.cubeB === candidate.cubeB && entry.faceB === candidate.faceB &&
    sameNormal(entry.worldNormalFromA, candidate.worldNormalFromA),
  );
  if (!adjacency) throw new Error('Face adjacency is not part of the supplied CubeNetwork');
  return adjacency;
}

/**
 * Resolve an adjacency into cell pairs. Same-resolution faces get a bijection
 * based on their oriented tangent-grid coordinates. Unequal resolutions are
 * intentionally left unmapped until an explicit non-bijective coupling model
 * is specified by a later research layer.
 */
export function resolveFaceConnection(
  engine: SlotIndexingEngine,
  network: CubeNetwork,
  adjacencyInput: FaceAdjacency,
): ResolvedFaceConnection {
  if (network === null || typeof network !== 'object' ||
      typeof network.systemKey !== 'string' ||
      !Array.isArray(network.placements) || !Array.isArray(network.connections)) {
    throw new TypeError('CubeNetwork is malformed');
  }
  if (network.systemKey !== systemSpecKey(engine)) {
    throw new Error('CubeNetwork was built for a different SystemSpec');
  }
  const validatedNetwork = createCubeNetwork(engine, network.placements);
  if (adjacencyInput === null || typeof adjacencyInput !== 'object' ||
      !isFaceId(adjacencyInput.faceA) || !isFaceId(adjacencyInput.faceB)) {
    throw new TypeError('Face adjacency is malformed');
  }
  const adjacency = findNetworkAdjacency(validatedNetwork, adjacencyInput);
  const placementA = validatedNetwork.placements.find((p) => p.cubeId === adjacency.cubeA);
  const placementB = validatedNetwork.placements.find((p) => p.cubeId === adjacency.cubeB);
  if (!placementA || !placementB) throw new Error('Connection references a cube without a placement');

  const gridSizeA = engine.getCube(adjacency.cubeA).gridSize;
  const gridSizeB = engine.getCube(adjacency.cubeB).gridSize;
  const worldNormalA = transformNormal(placementA.orientation, normalForFace(adjacency.faceA));
  const worldNormalB = transformNormal(placementB.orientation, normalForFace(adjacency.faceB));
  if (!sameNormal(worldNormalA, adjacency.worldNormalFromA) || !sameNormal(worldNormalB, opposite(adjacency.worldNormalFromA))) {
    throw new Error('Face adjacency has inconsistent world-facing normals');
  }

  if (gridSizeA !== gridSizeB) {
    return Object.freeze({
      ...adjacency,
      systemKey: validatedNetwork.systemKey,
      gridSizeA,
      gridSizeB,
      mappingStatus: 'different-resolution' as const,
      pairs: Object.freeze([]),
    });
  }

  const n = gridSizeA;
  const targetByTangent = new Map<string, SlotId>();
  for (const coordinate of faceCoordinates(engine, adjacency.cubeB, adjacency.faceB)) {
    const address = coordinateToSurfaceAddress(engine, coordinate);
    const transformed = transformGridPosition(placementB.orientation, address.position, n);
    const key = tangentialKey(transformed, adjacency.worldNormalFromA);
    if (targetByTangent.has(key)) throw new Error(`Duplicate target tangent coordinate ${key}`);
    targetByTangent.set(key, engine.coordinateToSlotId(coordinate));
  }

  const pairs: FaceCellPair[] = [];
  const usedTargets = new Set<number>();
  for (const coordinate of faceCoordinates(engine, adjacency.cubeA, adjacency.faceA)) {
    const address = coordinateToSurfaceAddress(engine, coordinate);
    const transformed = transformGridPosition(placementA.orientation, address.position, n);
    const key = tangentialKey(transformed, adjacency.worldNormalFromA);
    const slotB = targetByTangent.get(key);
    if (slotB === undefined) throw new Error(`No matching target cell for tangent coordinate ${key}`);
    const numericTarget = Number(slotB);
    if (usedTargets.has(numericTarget)) throw new Error(`Target slot ${numericTarget} was mapped more than once`);
    usedTargets.add(numericTarget);
    pairs.push(Object.freeze({
      slotA: engine.coordinateToSlotId(coordinate),
      slotB,
    }));
  }

  if (pairs.length !== n * n || usedTargets.size !== n * n || targetByTangent.size !== n * n) {
    throw new Error('Internal invariant failed: equal-size face mapping is not bijective');
  }

  return Object.freeze({
    ...adjacency,
    systemKey: validatedNetwork.systemKey,
    gridSizeA,
    gridSizeB,
    mappingStatus: 'bijective' as const,
    pairs: Object.freeze(pairs),
  });
}

/** Resolve every adjacency in a validated network. */
export function resolveFaceConnections(
  engine: SlotIndexingEngine,
  network: CubeNetwork,
): readonly ResolvedFaceConnection[] {
  if (network === null || typeof network !== 'object' ||
      typeof network.systemKey !== 'string' ||
      !Array.isArray(network.placements) || !Array.isArray(network.connections)) {
    throw new TypeError('CubeNetwork is malformed');
  }
  if (network.systemKey !== systemSpecKey(engine)) throw new Error('CubeNetwork was built for a different SystemSpec');
  const validated = createCubeNetwork(engine, network.placements);
  return Object.freeze(validated.connections.map((connection) => resolveFaceConnection(engine, validated, connection)));
}

/** Utility for consumer tests and callers that want only the mapped slot IDs. */
export function facePairSlots(pair: FaceCellPair): readonly [SlotId, SlotId] {
  if (pair === null || typeof pair !== 'object' || typeof pair.slotA !== 'number' || typeof pair.slotB !== 'number') {
    throw new TypeError('FaceCellPair must contain numeric slotA and slotB values');
  }
  return Object.freeze([makeSlotId(pair.slotA), makeSlotId(pair.slotB)] as const);
}
