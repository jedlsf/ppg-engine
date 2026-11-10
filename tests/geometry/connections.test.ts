import { describe, expect, it } from 'vitest';
import {
  CUBE_ORIENTATIONS,
  FaceId,
  IDENTITY_ORIENTATION,
  SlotIndexingEngine,
  createCubeNetwork,
  makeCubeId,
  resolveFaceConnection,
  resolveFaceConnections,
  worldNormalForFace,
} from '../../src/core/geometry/index.js';
import type { CubePlacement, FaceAdjacency, FaceNormal } from '../../src/core/geometry/index.js';

function findOrientation(localFace: FaceId, desired: FaceNormal) {
  const item = CUBE_ORIENTATIONS.find((orientation) => {
    const normal = worldNormalForFace(orientation.id, localFace);
    return normal.x === desired.x && normal.y === desired.y && normal.z === desired.z;
  });
  if (!item) throw new Error('Test setup error: no matching orientation');
  return item.id;
}

function placement(cubeId: number, x: number, gridUnused = 0, orientation = IDENTITY_ORIENTATION): CubePlacement {
  return { cubeId: makeCubeId(cubeId), position: { x, y: gridUnused, z: 0 }, orientation };
}

describe('Layer 1: inter-cube face connections', () => {
  it.each([1, 2, 3, 4, 7])('creates a complete one-to-one mapping for equal face grids N=%i', (n) => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([n, n]));
    const network = createCubeNetwork(engine, [placement(0, 0), placement(1, 1)]);
    const [connection] = resolveFaceConnections(engine, network);
    expect(connection).toBeDefined();
    expect(connection!.mappingStatus).toBe('bijective');
    expect(connection!.pairs).toHaveLength(n * n);

    const aSlots = connection!.pairs.map((pair) => Number(pair.slotA));
    const bSlots = connection!.pairs.map((pair) => Number(pair.slotB));
    expect(new Set(aSlots).size).toBe(n * n);
    expect(new Set(bSlots).size).toBe(n * n);
    for (const slot of aSlots) {
      const coordinate = engine.slotIdToCoordinate(slot as never);
      expect(coordinate.cubeId).toBe(connection!.cubeA);
      expect(coordinate.faceId).toBe(connection!.faceA);
    }
    for (const slot of bSlots) {
      const coordinate = engine.slotIdToCoordinate(slot as never);
      expect(coordinate.cubeId).toBe(connection!.cubeB);
      expect(coordinate.faceId).toBe(connection!.faceB);
    }
  });

  it('resolves the mapping when one cube has a different orientation', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([4, 4]));
    const orientation = findOrientation(FaceId.FRONT, { x: -1, y: 0, z: 0 });
    const network = createCubeNetwork(engine, [placement(0, 0), placement(1, 1, 0, orientation)]);
    const [connection] = resolveFaceConnections(engine, network);
    expect(connection!.faceB).toBe(FaceId.FRONT);
    expect(connection!.mappingStatus).toBe('bijective');
    expect(connection!.pairs).toHaveLength(16);
    expect(new Set(connection!.pairs.map((pair) => Number(pair.slotB))).size).toBe(16);
  });

  it('records unequal face resolutions without inventing a cell bijection', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3, 4]));
    const network = createCubeNetwork(engine, [placement(0, 0), placement(1, 1)]);
    const [connection] = resolveFaceConnections(engine, network);
    expect(connection!.mappingStatus).toBe('different-resolution');
    expect(connection!.gridSizeA).toBe(3);
    expect(connection!.gridSizeB).toBe(4);
    expect(connection!.pairs).toEqual([]);
  });

  it('rejects an adjacency that is not present in the network', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([2, 2]));
    const network = createCubeNetwork(engine, [placement(0, 0), placement(1, 1)]);
    const fake: FaceAdjacency = {
      ...network.connections[0]!,
      faceA: FaceId.UP,
    };
    expect(() => resolveFaceConnection(engine, network, fake)).toThrowError(/not part/);
  });


  it('rejects using a network with a different system specification', () => {
    const sourceEngine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3, 3]));
    const network = createCubeNetwork(sourceEngine, [placement(0, 0), placement(1, 1)]);
    const otherEngine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([3, 4]));
    expect(() => resolveFaceConnections(otherEngine, network)).toThrowError(/different SystemSpec/);
  });

  it('returns an empty resolution list for disconnected cubes', () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([2, 2]));
    const network = createCubeNetwork(engine, [placement(0, 0), placement(1, 3)]);
    expect(resolveFaceConnections(engine, network)).toEqual([]);
  });
});
