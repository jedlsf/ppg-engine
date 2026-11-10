import { makeSlotId, MAX_SUPPORTED_TOTAL_SLOTS, type SlotId } from './types.js';

/**
 * A permutation of the global slot set [0, size).
 * sourceToDestination[source] gives the destination for that source slot.
 */
export interface Permutation {
  readonly size: number;
  readonly sourceToDestination: readonly SlotId[];
}

/** Build a validated immutable permutation from source -> destination indices. */
export function createPermutation(sourceToDestination: readonly number[]): Permutation {
  if (!Array.isArray(sourceToDestination)) {
    throw new TypeError('sourceToDestination must be an array');
  }

  const size = sourceToDestination.length;
  if (size > MAX_SUPPORTED_TOTAL_SLOTS) throw new RangeError(`Permutation size exceeds the supported limit of ${MAX_SUPPORTED_TOTAL_SLOTS}`);
  if (!Number.isSafeInteger(size)) {
    throw new RangeError('Permutation size must be a safe integer');
  }

  const seen = new Uint8Array(size);
  const normalized: SlotId[] = new Array<SlotId>(size);

  for (let source = 0; source < size; source += 1) {
    if (!Object.hasOwn(sourceToDestination, source)) throw new TypeError(`Permutation mapping is sparse at source ${source}`);
    const destination = sourceToDestination[source];
    if (!Number.isSafeInteger(destination) || destination < 0 || destination >= size) {
      throw new RangeError(
        `Invalid destination ${String(destination)} for source ${source}; expected an integer in [0, ${size - 1}]`,
      );
    }
    if (seen[destination] !== 0) {
      throw new Error(`Invalid permutation: destination ${destination} occurs more than once`);
    }
    seen[destination] = 1;
    normalized[source] = makeSlotId(destination);
  }

  return Object.freeze({
    size,
    sourceToDestination: Object.freeze(normalized),
  });
}

/** Create the identity permutation of the given number of slots. */
export function identityPermutation(size: number): Permutation {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SUPPORTED_TOTAL_SLOTS) {
    throw new RangeError(`Permutation size must be a non-negative safe integer; received ${String(size)}`);
  }
  return createPermutation(Array.from({ length: size }, (_, index) => index));
}

/** Return the inverse permutation. */
export function invertPermutation(permutation: Permutation): Permutation {
  assertPermutationShape(permutation);
  const inverse = new Array<number>(permutation.size);
  for (let source = 0; source < permutation.size; source += 1) {
    const destination = Number(permutation.sourceToDestination[source]);
    inverse[destination] = source;
  }
  return createPermutation(inverse);
}

/**
 * Compose permutations in execution order: apply `first`, then `second`.
 * Therefore result[source] = second[first[source]].
 */
export function composePermutations(first: Permutation, second: Permutation): Permutation {
  assertPermutationShape(first);
  assertPermutationShape(second);
  if (first.size !== second.size) {
    throw new RangeError(
      `Cannot compose permutations of different sizes (${first.size} and ${second.size})`,
    );
  }

  const result = new Array<number>(first.size);
  for (let source = 0; source < first.size; source += 1) {
    const intermediate = Number(first.sourceToDestination[source]);
    result[source] = Number(second.sourceToDestination[intermediate]);
  }
  return createPermutation(result);
}

/** Apply a permutation to a state array, moving each source value to its destination. */
export function applyPermutation<T>(state: readonly T[], permutation: Permutation): T[] {
  assertPermutationShape(permutation);
  if (!Array.isArray(state) || state.length !== permutation.size) {
    throw new RangeError(
      `State length mismatch: expected ${permutation.size}, received ${Array.isArray(state) ? state.length : 'non-array'}`,
    );
  }

  const output = new Array<T>(permutation.size);
  for (let source = 0; source < permutation.size; source += 1) {
    if (!Object.hasOwn(state, source)) throw new TypeError(`State array is sparse at source ${source}`);
    const destination = Number(permutation.sourceToDestination[source]);
    output[destination] = state[source]!;
  }
  return output;
}

/** True when every source maps to a unique valid destination. */
export function isPermutation(permutation: Permutation): boolean {
  try {
    assertPermutationShape(permutation);
    return true;
  } catch {
    return false;
  }
}

function assertPermutationShape(permutation: Permutation): void {
  if (permutation === null || typeof permutation !== 'object') {
    throw new TypeError('Permutation must be an object');
  }
  if (!Number.isSafeInteger(permutation.size) || permutation.size < 0 || permutation.size > MAX_SUPPORTED_TOTAL_SLOTS) {
    throw new RangeError('Permutation.size must be a non-negative safe integer');
  }
  if (!Array.isArray(permutation.sourceToDestination) || permutation.sourceToDestination.length !== permutation.size) {
    throw new RangeError('Permutation mapping length does not match Permutation.size');
  }

  // Revalidate public data because a caller can bypass the factory with casts.
  const seen = new Uint8Array(permutation.size);
  for (let source = 0; source < permutation.size; source += 1) {
    if (!Object.hasOwn(permutation.sourceToDestination, source)) throw new TypeError(`Permutation mapping is sparse at source ${source}`);
    const destination = permutation.sourceToDestination[source];
    if (typeof destination !== 'number' || !Number.isSafeInteger(destination) || destination < 0 || destination >= permutation.size) {
      throw new RangeError(`Invalid destination at source ${source}`);
    }
    if (seen[destination] !== 0) {
      throw new Error(`Destination ${destination} occurs more than once`);
    }
    seen[destination] = 1;
  }
}
