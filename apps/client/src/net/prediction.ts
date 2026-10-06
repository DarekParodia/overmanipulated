// Client-side prediction for the local player: inputs are applied immediately with the same
// shared movement code the server uses, then reconciled when a snapshot acknowledges them.
// Visual corrections are smoothed so a misprediction never snaps the character.
import {
  applyPlayerInput,
  type PlayerInput,
  type PlayerState,
  TICK_MS,
  type TileMap,
} from '@redakcja/shared';

/** Fraction of the remaining visual error kept per second (exponential decay). */
const CORRECTION_KEEP_PER_SECOND = 0.0005;
/** Errors larger than this (tiles) are snapped instead of smoothed (e.g. after a respawn). */
const SNAP_DISTANCE = 2;

export type Predictor = {
  /** Applies a local input for one tick and remembers it until acknowledged. */
  applyLocal(input: PlayerInput): void;
  /** Reconciles with the authoritative state of the local player from a snapshot. */
  reconcile(server: PlayerState): void;
  /** Interpolated render position between the last two predicted ticks plus smoothing. */
  renderPosition(alpha: number): { x: number; y: number };
  /** Decays the visual correction offset; call once per rendered frame. */
  decayCorrection(dtMs: number): void;
  readonly state: PlayerState | null;
  readonly pendingCount: number;
};

export function createPredictor(map: TileMap): Predictor {
  let state: PlayerState | null = null;
  let previous: PlayerState | null = null;
  let pending: PlayerInput[] = [];
  let correction = { x: 0, y: 0 };

  return {
    applyLocal(input) {
      if (!state) {
        return;
      }
      previous = state;
      state = applyPlayerInput(state, input, TICK_MS, map);
      pending.push(input);
    },

    reconcile(server) {
      pending = pending.filter((input) => input.seq > server.lastInputSeq);
      let replayed = server;
      for (const input of pending) {
        replayed = applyPlayerInput(replayed, input, TICK_MS, map);
      }
      if (state) {
        const dx = state.x - replayed.x;
        const dy = state.y - replayed.y;
        if (Math.hypot(dx, dy) > SNAP_DISTANCE) {
          correction = { x: 0, y: 0 };
          previous = replayed;
        } else {
          correction = { x: correction.x + dx, y: correction.y + dy };
          // Keep the in-between frame consistent with the corrected state.
          if (previous) {
            previous = { ...previous, x: previous.x - dx, y: previous.y - dy };
          }
        }
      } else {
        previous = replayed;
      }
      state = replayed;
    },

    renderPosition(alpha) {
      if (!state) {
        return { x: 0, y: 0 };
      }
      const from = previous ?? state;
      const t = Math.min(1, Math.max(0, alpha));
      return {
        x: from.x + (state.x - from.x) * t + correction.x,
        y: from.y + (state.y - from.y) * t + correction.y,
      };
    },

    decayCorrection(dtMs) {
      const keep = CORRECTION_KEEP_PER_SECOND ** (dtMs / 1000);
      correction = { x: correction.x * keep, y: correction.y * keep };
    },

    get state() {
      return state;
    },
    get pendingCount() {
      return pending.length;
    },
  };
}
