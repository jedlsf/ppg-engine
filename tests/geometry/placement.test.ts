import { describe, expect, it } from 'vitest';
import {
  CUBE_ORIENTATIONS,
  FaceId,
  IDENTITY_ORIENTATION,
  composeCubeOrientations,
  createLatticePosition,
  invertCubeOrientation,
  getCubeOrientation,
  localFaceForWorldNormal,
  makeCubeOrientationId,
  orientationDeterminant,
  transformGridPosition,
  transformNormal,
  worldNormalForFace,
} from  '../../src/core/geometry/index.js';
import type { FaceNormal } from  '../../src/core/geometry/index.js';

const FACES = [FaceId.UP, FaceId.DOWN, FaceId.LEFT, FaceId.RIGHT, FaceId.FRONT, FaceId.BACK] as const;

function positionKey(p: { x: number; y: number; z: number }): string {
  return `${p.x},${p.y},${p.z}`;
}

describe('Layer 1: cube placement and orientations', () => {
  it('defines exactly 24 unique proper cube orientations with identity first', () => {
    expect(CUBE_ORIENTATIONS).toHaveLength(24);
    expect(IDENTITY_ORIENTATION).toBe(0);
    expect(getCubeOrientation(IDENTITY_ORIENTATION).matrix).toEqual([
      [1, 0, 0], [0, 1, 0], [0, 0, 1],
    ]);
    expect(new Set(CUBE_ORIENTATIONS.map((o) => o.matrix.flat().join(','))).size).toBe(24);
    for (const orientation of CUBE_ORIENTATIONS) {
      expect(orientationDeterminant(orientation.id)).toBe(1);
    }
  });

  it('maps each local face to one unique world cardinal direction', () => {
    for (const orientation of CUBE_ORIENTATIONS) {
      const normals = FACES.map((face) => worldNormalForFace(orientation.id, face));
      const keys = normals.map((n) => `${n.x},${n.y},${n.z}`);
      expect(new Set(keys).size).toBe(6);
      for (const normal of normals) {
        expect(localFaceForWorldNormal(orientation.id, normal)).toBe(
          FACES[normals.findIndex((n) => n.x === normal.x && n.y === normal.y && n.z === normal.z)],
        );
      }
    }
  });

  it.each([1, 2, 3, 4, 7])('keeps transformed grid coordinates bijective for N=%i', (n) => {
    for (const orientation of CUBE_ORIENTATIONS) {
      const mapped = new Set<string>();
      for (let x = 0; x < n; x += 1) {
        for (let y = 0; y < n; y += 1) {
          for (let z = 0; z < n; z += 1) {
            const target = transformGridPosition(orientation.id, { x, y, z }, n);
            for (const value of [target.x, target.y, target.z]) {
              expect(Number.isSafeInteger(value)).toBe(true);
              expect(value).toBeGreaterThanOrEqual(0);
              expect(value).toBeLessThan(n);
            }
            mapped.add(positionKey(target));
          }
        }
      }
      expect(mapped.size).toBe(n ** 3);
    }
  });

  it('transforms valid normals without introducing diagonal vectors', () => {
    const input: FaceNormal = { x: 1, y: 0, z: 0 };
    for (const orientation of CUBE_ORIENTATIONS) {
      const output = transformNormal(orientation.id, input);
      expect([output.x, output.y, output.z].filter((v) => v !== 0)).toHaveLength(1);
      expect(Math.abs(output.x) + Math.abs(output.y) + Math.abs(output.z)).toBe(1);
    }
  });

  it('validates orientation IDs and lattice positions', () => {
    expect(() => makeCubeOrientationId(-1)).toThrowError(/CubeOrientationId/);
    expect(() => makeCubeOrientationId(24)).toThrowError(/CubeOrientationId/);
    expect(() => makeCubeOrientationId(1.5)).toThrowError(/CubeOrientationId/);
    expect(createLatticePosition({ x: -1, y: 2, z: 3 })).toEqual({ x: -1, y: 2, z: 3 });
    expect(() => createLatticePosition({ x: 0.5, y: 0, z: 0 })).toThrowError(/safe integer/);
    expect(() => transformGridPosition(IDENTITY_ORIENTATION, { x: 3, y: 0, z: 0 }, 3)).toThrowError(/GridPosition.x/);
  });

  it('forms a closed rotation group with inverses', () => {
    for (const first of CUBE_ORIENTATIONS) {
      const inverse = invertCubeOrientation(first.id);
      expect(composeCubeOrientations(first.id, inverse)).toBe(IDENTITY_ORIENTATION);
      expect(composeCubeOrientations(inverse, first.id)).toBe(IDENTITY_ORIENTATION);
      for (const second of CUBE_ORIENTATIONS) {
        expect(CUBE_ORIENTATIONS[composeCubeOrientations(first.id, second.id)]).toBeDefined();
      }
    }
  });
});
