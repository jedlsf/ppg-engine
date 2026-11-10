import {
  SlotIndexingEngine,
  createFaceExchangePermutation,
  createFaceTurnPermutation,
  createSliceMovePermutation,
  createSystemSpec,
  makeCubeId,
  makeSlotId,
  systemSpecKey,
  type CubeConfig,
  type FaceTurnMove,
  type Permutation,
  type ResolvedFaceConnection,
  type SliceMove,
  type SlotId,
  type SystemSpec,
} from "./core/geometry/index.js";
import {
  createRingParameters,
  Polynomial,
  PolynomialState,
  sameRing,
  type PolynomialInitializer,
  type PolynomialRingParameters,
} from "./core/polynomial/index.js";
import {
  composeTransformations,
  PolynomialCoupling,
  PermutationAction,
  RingAutomorphism,
  type PolynomialStateTransformation,
  type TransformationKind,
  validateTransformationName,
} from "./core/transform/index.js";

/** Configuration for a PPG Engine instance. */
export interface PPGEngineConfig {
  /**
   * Grid sizes create cube IDs 0..n-1. For explicit IDs, pass CubeConfig
   * objects created with makeCubeId().
   */
  readonly cubes: readonly number[] | readonly CubeConfig[];
  /** Coefficient ring R_q = Z_q[X] / (X^n + 1). */
  readonly ring: Pick<PolynomialRingParameters, "modulus" | "degree">;
  /** Optional initial polynomial value for every canonical geometry slot. */
  readonly initialize?: PolynomialInitializer;
  /** Maximum retained undo history; defaults to 1000 (0 disables history). */
  readonly maxHistoryEntries?: number;
}

/**
 * Describes the operation categories recorded in the PPGEngine history timeline.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export type PPGEngineOperationKind = TransformationKind | "state-edit";

/**
 * Immutable metadata for one successfully committed engine operation.
 *
 * @remarks Public entry points validate runtime values and preserve the
 * documented immutable-state and resource-boundary contracts.
 */
export interface PPGEngineHistoryEntry {
  readonly id: number;
  readonly kind: PPGEngineOperationKind;
  readonly name: string;
  readonly appliedAt: number;
}

interface HistoryFrame {
  readonly state: PolynomialState;
  readonly entry: PPGEngineHistoryEntry;
}

/**
 * PPGEngine is the orchestration façade for Layers 1–3:
 *
 * - Layer 1: cube geometry, canonical slots, topology and permutations.
 * - Layer 2: polynomial ring arithmetic and immutable polynomial state.
 * - Layer 3: reversible state transformations and composition.
 *
 * This is a mathematical state/transformation engine, not a cryptographic
 * primitive. JavaScript BigInt arithmetic is not guaranteed constant-time.
 */
export class PPGEngine {
  /**
   * Validated immutable cube specification that defines this engine's canonical slot order.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly systemSpec: SystemSpec;
  /**
   * Layer 1 indexer used for coordinate, slot, move, and topology operations.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly geometry: SlotIndexingEngine;
  /**
   * Layer 2 quotient-ring parameters shared by every polynomial in the current state.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public readonly ring: PolynomialRingParameters;

  private baselineState: PolynomialState;
  private currentState: PolynomialState;
  private readonly undoFrames: HistoryFrame[] = [];
  private readonly redoFrames: HistoryFrame[] = [];
  private readonly operationHistory: PPGEngineHistoryEntry[] = [];
  private nextOperationId = 1;
  private readonly maxHistoryEntries: number;

  /**
   * Construct an engine, validate its geometry and ring configuration, and initialize its baseline state.
 *
 * @param config Cube layout, polynomial-ring parameters, optional initializer, and history limit.
 * @throws {TypeError} If the configuration or cube collection has an invalid runtime shape.
 * @throws {RangeError} If a resource limit or mathematical parameter constraint is exceeded.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public constructor(config: PPGEngineConfig) {
    if (config === null || typeof config !== "object") {
      throw new TypeError("PPGEngine configuration must be an object");
    }
    if (!Array.isArray(config.cubes)) throw new TypeError("config.cubes must be an array");
    for (let index = 0; index < config.cubes.length; index += 1) {
      if (!Object.hasOwn(config.cubes, index)) throw new TypeError(`config.cubes is sparse at index ${index}`);
    }
    const usesGridSizes = config.cubes.length > 0 && config.cubes.every((cube) => typeof cube === "number");
    const usesCubeConfigs = config.cubes.length > 0 && config.cubes.every(
      (cube) => cube !== null && typeof cube === "object" && !Array.isArray(cube),
    );
    if (config.cubes.length === 0) this.systemSpec = SlotIndexingEngine.createSpec([]);
    else if (usesGridSizes) this.systemSpec = SlotIndexingEngine.createSpec(config.cubes as readonly number[]);
    else if (usesCubeConfigs) this.systemSpec = createSystemSpec(config.cubes as readonly CubeConfig[]);
    else throw new TypeError("config.cubes must contain only grid sizes or only CubeConfig objects");

    const historyLimit = config.maxHistoryEntries ?? 1_000;
    if (!Number.isSafeInteger(historyLimit) || historyLimit < 0 || historyLimit > 10_000) {
      throw new RangeError("maxHistoryEntries must be an integer between 0 and 10000");
    }
    this.maxHistoryEntries = historyLimit;
    this.geometry = new SlotIndexingEngine(this.systemSpec);
    this.ring = createRingParameters(config.ring?.modulus, config.ring?.degree);

    const initial = config.initialize
      ? PolynomialState.fromInitializer(this.geometry, this.ring, config.initialize)
      : PolynomialState.zero(this.geometry, this.ring);

    this.baselineState = initial;
    this.currentState = initial;
  }

  /** Current immutable polynomial state. */
  public get state(): PolynomialState {
    return this.currentState;
  }

  /**
   * Return the total canonical facelet-slot count.
   *
   * @remarks Public entry points validate runtime values and preserve the
   * documented immutable-state and resource-boundary contracts.
   */
  public get totalSlots(): number {
    return this.systemSpec.totalSlots;
  }

  /** A frozen snapshot of the operations on the current undo/redo timeline. */
  public getHistory(): readonly PPGEngineHistoryEntry[] {
    return Object.freeze([...this.operationHistory]);
  }

  /** Replace the current state and establish it as the new reset baseline. */
  public setState(state: PolynomialState): void {
    if (!(state instanceof PolynomialState)) {
      throw new TypeError("state must be a PolynomialState");
    }
    if (systemSpecKey(state.engine) !== systemSpecKey(this.geometry)) {
      throw new RangeError("State belongs to a different ordered geometry specification");
    }
    if (!sameRing(state.ring, this.ring)) {
<<<<<<< HEAD
      throw new RangeError("State uses incompatible ring parameters");
=======
      throw new RangeError("State uses incompatible ring parameters (polynomial ring mismatch)");
>>>>>>> 489af57ef9c58bed47e540a007e5bd9af1edcd25
    }

    const normalized = PolynomialState.fromValues(this.geometry, this.ring, state.values);
    this.baselineState = normalized;
    this.currentState = normalized;
    this.clearHistory();
  }

  /** Initialize every slot and establish the resulting state as the reset baseline. */
  public initialize(initializer: PolynomialInitializer): void {
    const next = PolynomialState.fromInitializer(this.geometry, this.ring, initializer);
    this.baselineState = next;
    this.currentState = next;
    this.clearHistory();
  }

  /** Read one polynomial by canonical global slot ID. */
  public getPolynomial(slot: number | SlotId): Polynomial {
    return this.currentState.get(this.normalizeSlot(slot));
  }

  /** Persistently replace one slot value; the previous state remains undoable. */
  public setPolynomial(slot: number | SlotId, value: Polynomial): PolynomialState {
    if (!(value instanceof Polynomial)) {
      throw new TypeError("value must be a Polynomial");
    }
    if (!sameRing(value.ring, this.ring)) {
      throw new RangeError("Polynomial uses incompatible ring parameters");
    }
    const normalizedSlot = this.normalizeSlot(slot);
    const next = this.currentState.withValue(normalizedSlot, value);
    return this.commit(next, "state-edit", `set-slot-${Number(normalizedSlot)}`);
  }

  /**
   * Load a flattened canonical coefficient vector. Each slot contributes
   * exactly ring.degree coefficients, in ascending polynomial degree order.
   */
  public setStateCoefficients(coefficients: readonly bigint[]): PolynomialState {
    if (!Array.isArray(coefficients)) {
      throw new TypeError("coefficients must be an array");
    }
    const expected = this.systemSpec.totalSlots * this.ring.degree;
    if (!Number.isSafeInteger(expected) || coefficients.length !== expected) {
      throw new RangeError(
        `Expected ${expected} coefficients; received ${coefficients.length}`,
      );
    }

    const values: Polynomial[] = [];
    for (let offset = 0; offset < coefficients.length; offset += this.ring.degree) {
      values.push(
        Polynomial.fromCanonicalCoefficients(
          this.ring,
          coefficients.slice(offset, offset + this.ring.degree),
        ),
      );
    }
    const next = PolynomialState.fromValues(this.geometry, this.ring, values);
    return this.commit(next, "state-edit", "load-coefficient-vector");
  }

  /** Return a frozen flattened state snapshot in canonical SlotId order. */
  public getStateCoefficients(): readonly bigint[] {
    const coefficients: bigint[] = [];
    for (const polynomial of this.currentState.values) {
      coefficients.push(...polynomial.coefficients);
    }
    return Object.freeze(coefficients);
  }

  /** Apply one Layer 3 reversible transformation. */
  public applyTransformation(
    transformation: PolynomialStateTransformation,
  ): PolynomialState {
    if (!transformation || typeof transformation !== "object") {
      throw new TypeError("transformation must be a PolynomialStateTransformation");
    }
    const validated = composeTransformations(
      this.geometry,
      this.ring,
      [transformation],
      transformation.name,
    );
    const next = validated.apply(this.currentState);
    return this.commit(next, transformation.kind, transformation.name);
  }

  /** Apply an ordered set of transformations as one atomic engine operation. */
  public applySequence(
    transformations: readonly PolynomialStateTransformation[],
    name = "transformation-sequence",
  ): PolynomialState {
    if (!Array.isArray(transformations)) throw new TypeError("transformations must be an array");
    validateTransformationName(name);
    if (transformations.length === 0) return this.currentState;

    const sequence = composeTransformations(
      this.geometry,
      this.ring,
      transformations,
      name,
    );
    const next = sequence.apply(this.currentState);
    return this.commit(next, "sequence", sequence.name);
  }

  /** Apply a validated global slot permutation to all polynomial payloads. */
  public applyPermutation(permutation: Permutation, name?: string): PolynomialState {
    const action = new PermutationAction(
      this.geometry,
      this.ring,
      permutation,
      name ?? "slot-permutation",
    );
    return this.applyTransformation(action);
  }

  /** Rotate one face using the face-relative clockwise convention. */
  public applyFaceTurn(move: FaceTurnMove): PolynomialState {
    return this.applyPermutation(
      createFaceTurnPermutation(this.geometry, move),
      `face-turn-${move.cubeId}-${move.faceId}`,
    );
  }

  /** Rotate one geometric slice using the positive world-axis convention. */
  public applySliceMove(move: SliceMove): PolynomialState {
    return this.applyPermutation(
      createSliceMovePermutation(this.geometry, move),
      `slice-move-${move.cubeId}-${move.axis}-${move.layer}`,
    );
  }

  /** Exchange payloads across a resolved equal-resolution cube-face connection. */
  public applyFaceExchange(connection: ResolvedFaceConnection): PolynomialState {
    return this.applyPermutation(
      createFaceExchangePermutation(this.geometry, connection),
      `face-exchange-${connection.cubeA}-${connection.faceA}-${connection.cubeB}-${connection.faceB}`,
    );
  }

  /** Apply the invertible shear target += coefficient * source. */
  public applyCoupling(
    source: number | SlotId,
    target: number | SlotId,
    coefficient: Polynomial,
    name = "polynomial-coupling",
  ): PolynomialState {
    const transformation = new PolynomialCoupling(
      this.geometry,
      this.ring,
      this.normalizeSlot(source),
      this.normalizeSlot(target),
      coefficient,
      name,
    );
    return this.applyTransformation(transformation);
  }

  /** Apply the ring automorphism X -> X^exponent to every slot polynomial. */
  public applyRingAutomorphism(exponent: number, name?: string): PolynomialState {
    return this.applyTransformation(
      new RingAutomorphism(this.geometry, this.ring, exponent, name),
    );
  }

  /** Restore the constructor/initialize/setState baseline and clear history. */
  public reset(): PolynomialState {
    this.currentState = this.baselineState;
    this.clearHistory();
    return this.currentState;
  }

  /** Restore the preceding state. Returns false when there is nothing to undo. */
  public undo(): boolean {
    const frame = this.undoFrames.pop();
    if (!frame) return false;

    this.redoFrames.push({ state: this.currentState, entry: frame.entry });
    this.currentState = frame.state;
    this.operationHistory.pop();
    return true;
  }

  /** Reapply the most recently undone operation. Returns false when unavailable. */
  public redo(): boolean {
    const frame = this.redoFrames.pop();
    if (!frame) return false;

    this.undoFrames.push({ state: this.currentState, entry: frame.entry });
    this.currentState = frame.state;
    this.operationHistory.push(frame.entry);
    return true;
  }

  /** Compact metadata about this engine instance and its current timeline. */
  public getDiagnostics(): Readonly<{
    cubeCount: number;
    totalSlots: number;
    ringModulus: string;
    ringDegree: number;
    historyLength: number;
    undoDepth: number;
    redoDepth: number;
  }> {
    return Object.freeze({
      cubeCount: this.systemSpec.cubes.length,
      totalSlots: this.systemSpec.totalSlots,
      ringModulus: this.ring.modulus.toString(10),
      ringDegree: this.ring.degree,
      historyLength: this.operationHistory.length,
      undoDepth: this.undoFrames.length,
      redoDepth: this.redoFrames.length,
    });
  }

  private normalizeSlot(slot: number | SlotId): SlotId {
    if (typeof slot !== "number" || !Number.isSafeInteger(slot)) {
      throw new TypeError("slot must be a safe integer SlotId");
    }
    const normalized = makeSlotId(slot);
    this.geometry.slotIdToCoordinate(normalized);
    return normalized;
  }

  private commit(
    next: PolynomialState,
    kind: PPGEngineOperationKind,
    name: string,
  ): PolynomialState {
    if (!(next instanceof PolynomialState) || systemSpecKey(next.engine) !== systemSpecKey(this.geometry) || !sameRing(next.ring, this.ring)) {
      throw new RangeError("Cannot commit a state incompatible with this PPGEngine");
    }
    validateTransformationName(name);
    const entry: PPGEngineHistoryEntry = Object.freeze({
      id: this.nextOperationId++,
      kind,
      name,
      appliedAt: Date.now(),
    });
    if (this.maxHistoryEntries > 0) {
      this.undoFrames.push({ state: this.currentState, entry });
      this.operationHistory.push(entry);
      if (this.undoFrames.length > this.maxHistoryEntries) {
        this.undoFrames.shift();
        this.operationHistory.shift();
      }
    }
    this.redoFrames.length = 0;
    this.currentState = next;
    return this.currentState;
  }

  private clearHistory(): void {
    this.undoFrames.length = 0;
    this.redoFrames.length = 0;
    this.operationHistory.length = 0;
  }
}

/** Build a PPGEngine config with explicit cube identifiers. */
export function createPPGEngineConfig(
  cubes: readonly { readonly id: number; readonly gridSize: number }[],
  ring: Pick<PolynomialRingParameters, "modulus" | "degree">,
): PPGEngineConfig {
  if (!Array.isArray(cubes)) throw new TypeError("cubes must be an array");
  const normalized: CubeConfig[] = [];
  for (let index = 0; index < cubes.length; index += 1) {
    if (!Object.hasOwn(cubes, index)) throw new TypeError(`Cube configuration at index ${index} is missing`);
    const cube = cubes[index];
    if (cube === null || typeof cube !== "object" || Array.isArray(cube)) throw new TypeError(`Cube configuration at index ${index} is malformed`);
    normalized.push({ id: makeCubeId(cube.id), gridSize: cube.gridSize });
  }
  return { cubes: normalized, ring };
}
