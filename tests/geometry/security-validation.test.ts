import { describe, expect, it } from "vitest";
import {
  FaceId,
  MAX_SUPPORTED_CUBE_COUNT,
  MAX_SUPPORTED_GRID_SIZE,
  MAX_SUPPORTED_TOTAL_SLOTS,
  SlotIndexingEngine,
  applyPermutation,
  createCubeNetwork,
  createFaceExchangePermutation,
  createPermutation,
  createSystemSpec,
  faceForNormal,
  identityPermutation,
  isFaceId,
  isGlobalPermutation,
  isPermutation,
  makeCubeId,
  normalForFace,
  resolveFaceConnections,
  type CubeNetwork,
  type FaceNormal,
  type Permutation,
} from "../../src/index.js";

describe("Layer 1 adversarial validation and resource boundaries", () => {
  it("rejects cube counts above the documented allocation limit", () => {
    const gridSizes = Array.from({ length: MAX_SUPPORTED_CUBE_COUNT + 1 }, () => 1);
    expect(() => SlotIndexingEngine.createSpec(gridSizes)).toThrow(RangeError);
  });

  it("rejects grid sizes above the documented limit before calculating slot ranges", () => {
    expect(() => createSystemSpec([{ id: makeCubeId(0), gridSize: MAX_SUPPORTED_GRID_SIZE + 1 }])).toThrow(RangeError);
  });

  it("rejects total-slot counts that exceed the global allocation limit", () => {
    expect(() => SlotIndexingEngine.createSpec([128, 17])).toThrow(/supported limit/);
    expect(MAX_SUPPORTED_TOTAL_SLOTS).toBe(100_000);
  });

  it("rejects sparse cube and grid-size arrays", () => {
    const sparseCubes = new Array(1) as unknown as Array<{ id: ReturnType<typeof makeCubeId>; gridSize: number }>;
    expect(() => createSystemSpec(sparseCubes)).toThrow(/missing/);
    const sparseGridSizes = new Array(1) as number[];
    expect(() => SlotIndexingEngine.createSpec(sparseGridSizes)).toThrow(/missing/);
  });

  it("revalidates cube IDs and face IDs at runtime", () => {
    expect(() => makeCubeId(-1)).toThrow(RangeError);
    expect(() => makeCubeId(Number.NaN)).toThrow(RangeError);
    expect(() => makeCubeId(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(isFaceId("0")).toBe(false);
    expect(isFaceId(0.5)).toBe(false);
    expect(isFaceId(6)).toBe(false);
    expect(isFaceId(Number.NaN)).toBe(false);
  });

  it("does not accept inherited object keys as FaceId values", () => {
    expect(() => normalForFace("toString" as unknown as FaceId)).toThrow(RangeError);
  });

  it("rejects string-like, diagonal, and malformed face normals", () => {
    expect(() => faceForNormal({ x: "0", y: "1", z: "0" } as unknown as FaceNormal)).toThrow(RangeError);
    expect(() => faceForNormal({ x: 1, y: 1, z: 0 } as FaceNormal)).toThrow(RangeError);
    expect(() => faceForNormal({ x: 0, y: 0, z: 0 } as FaceNormal)).toThrow(RangeError);
    expect(() => faceForNormal({ x: 2, y: 0, z: 0 } as FaceNormal)).toThrow(RangeError);
    expect(() => faceForNormal(null as unknown as FaceNormal)).toThrow(TypeError);
  });

  it("rejects sparse and oversized permutations without allocating attacker-sized buffers", () => {
    const sparse = new Array(3) as number[];
    expect(() => createPermutation(sparse)).toThrow(/sparse/);
    const forged = { size: MAX_SUPPORTED_TOTAL_SLOTS + 1, sourceToDestination: [] } as unknown as Permutation;
    expect(isPermutation(forged)).toBe(false);
    expect(() => identityPermutation(MAX_SUPPORTED_TOTAL_SLOTS + 1)).toThrow(RangeError);
  });

  it("rejects string destinations in forged permutation objects", () => {
    const forged = { size: 2, sourceToDestination: ["1", "0"] } as unknown as Permutation;
    expect(isPermutation(forged)).toBe(false);
  });

  it("rejects sparse payload arrays rather than returning partially initialized state", () => {
    const sparse = [10, , 30] as number[];
    expect(() => applyPermutation(sparse, identityPermutation(3))).toThrow(/sparse/);
  });

  it("checks global permutation size before validating its mapping", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1]));
    const forged = { size: MAX_SUPPORTED_TOTAL_SLOTS + 1, sourceToDestination: [] } as unknown as Permutation;
    expect(isGlobalPermutation(engine, forged)).toBe(false);
  });

  it("rejects malformed or forged cube-network records", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1, 1]));
    const network = createCubeNetwork(engine, [
      { cubeId: makeCubeId(0), position: { x: 0, y: 0, z: 0 }, orientation: 0 as never },
      { cubeId: makeCubeId(1), position: { x: 1, y: 0, z: 0 }, orientation: 0 as never },
    ]);
    const forged = { ...network, connections: null } as unknown as CubeNetwork;
    expect(() => resolveFaceConnections(engine, forged)).toThrow(/malformed/);
  });

  it("rejects malformed face-exchange connection pairs before reading slots", () => {
    const engine = new SlotIndexingEngine(SlotIndexingEngine.createSpec([1, 1]));
    const forged = {
      systemKey: "ppc-layer1-v1|0:1|1:1",
      cubeA: makeCubeId(0),
      faceA: FaceId.RIGHT,
      cubeB: makeCubeId(1),
      faceB: FaceId.LEFT,
      worldNormalFromA: { x: 1, y: 0, z: 0 },
      gridSizeA: 1,
      gridSizeB: 1,
      mappingStatus: "bijective",
      pairs: [{ slotA: "0", slotB: 6 }],
    } as never;
    expect(() => createFaceExchangePermutation(engine, forged)).toThrow(/malformed/);
  });
});
