// Looping sounds keyed by what produces them (e.g. the typewriter loop per station). A small
// manager on top of an audio backend so it can be tested without Howler.
import type { AudioBus, SoundLayer } from '../cues.ts';

export type LoopBackend = {
  /** Starts a looping sprite; returns a handle, or null when the sound cannot play. */
  start(id: string, bus: AudioBus, volume: number): number | null;
  stop(handle: number): void;
};

export type LoopManager = {
  /** Starts a loop under `key`; a loop already running there keeps playing. */
  start(key: string, layer: SoundLayer, now: number): void;
  /** Stops one loop, or every loop when `key` is omitted. */
  stop(key?: string): void;
  /** Keys of running loops with the time each was (re)started. */
  active(): ReadonlyMap<string, number>;
};

export function createLoopManager(backend: LoopBackend): LoopManager {
  const handles = new Map<string, number | null>();
  const startedAt = new Map<string, number>();

  function stopKey(key: string): void {
    const handle = handles.get(key);
    if (handle !== undefined && handle !== null) {
      backend.stop(handle);
    }
    handles.delete(key);
    startedAt.delete(key);
  }

  return {
    start(key, layer, now) {
      startedAt.set(key, now);
      if (handles.has(key)) {
        return;
      }
      const id = layer.ids[0];
      handles.set(key, id ? backend.start(id, layer.bus, layer.volume ?? 1) : null);
    },
    stop(key) {
      if (key !== undefined) {
        stopKey(key);
        return;
      }
      for (const running of [...handles.keys()]) {
        stopKey(running);
      }
    },
    active() {
      return startedAt;
    },
  };
}
