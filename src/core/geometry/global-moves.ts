import type { SlotIndexingEngine } from './indexing.js';
import { systemSpecKey } from './topology.js';
import { makeSlotId } from './types.js';
import type { SlotId } from './types.js';
import {
  applyPermutation,
  composePermutations,
  createPermutation,
  identityPermutation,
  isPermutation,
  type Permutation,
} from './permutation.js';
import type { ResolvedFaceConnection } from './connections.js';

/**
 * Build a global exchange operation for a resolved, equal-resolution face
 * connection. Each paired facelet payload is swapped with its counterpart.
 * This is an abstract inter-cube coupling operation, not a physical Rubik's
 * Cube move. It is an involutive permutation (applying twice restores state).
 */
export function createFaceExchangePermutation(
  engine: SlotIndexingEngine,
  connection: ResolvedFaceConnection,
): Permutation {
  if (connection === null || typeof connection !== 'object') {
    throw new TypeError('ResolvedFaceConnection must be an object');
  }
  if (connection.systemKey !== systemSpecKey(engine)) {
    throw new Error('Resolved face connection was built for a different SystemSpec');
  }
  if (connection.mappingStatus !== 'bijective') {
    throw new RangeError(
      `Cannot create a face exchange for mappingStatus=${String(connection.mappingStatus)}; equal face resolutions are required`,
    );
  }
  const expectedPairs = connection.gridSizeA * connection.gridSizeA;
  if (connection.gridSizeA !== connection.gridSizeB || connection.pairs.length !== expectedPairs) {
    throw new RangeError('Face connection does not contain a complete equal-resolution mapping');
  }

  const mapping = Array.from({ length: engine.spec.totalSlots }, (_, index) => index);
  const touched = new Set<number>();
  for (const pair of connection.pairs) {
    const a = Number(pair.slotA);
    const b = Number(pair.slotB);
    if (a < 0 || a >= engine.spec.totalSlots || b < 0 || b >= engine.spec.totalSlots || a === b) {
      throw new RangeError(`Invalid face-cell pair (${a}, ${b})`);
    }
    if (touched.has(a) || touched.has(b)) {
      throw new Error('Face connection contains overlapping cell pairs');
    }
    // Verify the pair references the declared endpoint faces.
    const coordA = engine.slotIdToCoordinate(makeSlotId(a));
    const coordB = engine.slotIdToCoordinate(makeSlotId(b));
    if (coordA.cubeId !== connection.cubeA || coordA.faceId !== connection.faceA ||
        coordB.cubeId !== connection.cubeB || coordB.faceId !== connection.faceB) {
      throw new Error('Face connection pair references a slot outside its declared endpoint faces');
    }
    touched.add(a);
    touched.add(b);
    mapping[a] = b;
    mapping[b] = a;
  }

  return createPermutation(mapping);
}

/**
 * Compose global permutations in execution order: the first element is
 * applied first, then the second, and so on. Every mapping must cover the
 * complete canonical SlotId space in the supplied indexing engine.
 */
export function composeGlobalPermutations(
  engine: SlotIndexingEngine,
  operations: readonly Permutation[],
): Permutation {
  if (!Array.isArray(operations)) throw new TypeError('operations must be an array');
  let accumulated = identityPermutation(engine.spec.totalSlots);
  for (const [index, operation] of operations.entries()) {
    if (!isPermutation(operation)) {
      throw new RangeError(`Operation at index ${index} is not a valid permutation`);
    }
    if (operation.size !== engine.spec.totalSlots) {
      throw new RangeError(
        `Operation at index ${index} has size ${operation.size}; expected ${engine.spec.totalSlots}`,
      );
    }
    accumulated = composePermutations(accumulated, operation);
  }
  return accumulated;
}

/** Validate that a permutation covers exactly the complete global slot space. */
export function isGlobalPermutation(
  engine: SlotIndexingEngine,
  permutation: Permutation,
): boolean {
  return isPermutation(permutation) && permutation.size === engine.spec.totalSlots;
}

/** Apply a validated global permutation to a payload array indexed by SlotId. */
export function applyGlobalPermutation<T>(
  engine: SlotIndexingEngine,
  state: readonly T[],
  permutation: Permutation,
): T[] {
  if (!isGlobalPermutation(engine, permutation)) {
    throw new RangeError(`Permutation must be a valid global permutation of size ${engine.spec.totalSlots}`);
  }
  return applyPermutation(state, permutation);
}

/** Return a typed view of the pair as global SlotIds (useful in diagnostics). */
export function globalSlotPair(a: number, b: number): readonly [SlotId, SlotId] {
  return Object.freeze([makeSlotId(a), makeSlotId(b)] as const);
}
