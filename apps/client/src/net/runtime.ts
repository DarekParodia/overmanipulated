// Per-match client runtime: fixed 50 ms input ticks (send + predict), snapshot intake
// (interpolation buffer + reconciliation), and render-time sampling for the scene.
import {
  GREYBOX_MAP,
  type InputMessage,
  type PlayerState,
  type SnapshotMessage,
  TICK_MS,
} from '@redakcja/shared';
import { sampleInput } from '../input/input-manager.ts';
import { createPredictor, type Predictor } from './prediction.ts';
import {
  createSnapshotBuffer,
  type SampledPlayer,
  type SnapshotBuffer,
} from './snapshot-buffer.ts';

/** Never simulate more than this many input ticks in one frame (tab was in the background). */
const MAX_TICKS_PER_FRAME = 4;

export type RenderedPlayer = SampledPlayer & { local: boolean };

export type GameRuntime = {
  readonly map: typeof GREYBOX_MAP;
  readonly buffer: SnapshotBuffer;
  readonly predictor: Predictor;
  onSnapshot(snapshot: SnapshotMessage, receivedAt: number): void;
  /** Advances input ticks; returns the render state for this frame. */
  frame(now: number, dtMs: number): Map<string, RenderedPlayer>;
  reset(): void;
};

export function createRuntime(
  getLocalId: () => string | null,
  sendInput: (message: InputMessage) => void,
): GameRuntime {
  const map = GREYBOX_MAP;
  const buffer = createSnapshotBuffer();
  let predictor = createPredictor(map);
  let seq = 0;
  let accumulator = 0;
  let localKnown = false;

  return {
    map,
    buffer,
    get predictor() {
      return predictor;
    },

    onSnapshot(snapshot, receivedAt) {
      buffer.push(snapshot, receivedAt);
      const localId = getLocalId();
      const mine = snapshot.players.find((p) => p.id === localId);
      if (mine) {
        const server: PlayerState = { ...mine };
        predictor.reconcile(server);
        localKnown = true;
      }
    },

    frame(now, dtMs) {
      const localId = getLocalId();
      accumulator += dtMs;
      let ticks = 0;
      while (accumulator >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
        accumulator -= TICK_MS;
        ticks++;
        const sample = sampleInput();
        if (!localKnown) {
          continue;
        }
        const input: InputMessage = {
          type: 'input',
          seq: seq++,
          move: sample.move,
          actions: sample.actions,
        };
        sendInput(input);
        predictor.applyLocal(input);
      }
      if (ticks === MAX_TICKS_PER_FRAME) {
        accumulator = 0;
      }
      predictor.decayCorrection(dtMs);

      const players = new Map<string, RenderedPlayer>();
      for (const [id, sampled] of buffer.sample(now)) {
        players.set(id, { ...sampled, local: false });
      }
      const local = predictor.state;
      if (localId && local && localKnown) {
        const position = predictor.renderPosition(accumulator / TICK_MS);
        players.set(localId, {
          id: localId,
          x: position.x,
          y: position.y,
          facing: local.facing,
          moving: local.moving,
          local: true,
        });
      }
      return players;
    },

    reset() {
      buffer.clear();
      predictor = createPredictor(map);
      seq = 0;
      accumulator = 0;
      localKnown = false;
    },
  };
}
