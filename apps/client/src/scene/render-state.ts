// Per-frame render state shared between scene components without React re-renders.
import type { RenderedPlayer } from '../net/runtime.ts';

export const renderState = {
  players: new Map<string, RenderedPlayer>(),
  /** World position of the local player, if known (camera follow, audio pan). */
  local: null as { x: number; y: number } | null,
};
