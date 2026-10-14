// Per-frame render state shared between scene components without React re-renders. Each
// GameView (net/game-view.ts) has its own; `renderState` is the player view's.
import type { RenderedPlayer } from '../net/runtime.ts';
import type { HandAnchor } from './character/hands.ts';

export type RenderState = {
  players: Map<string, RenderedPlayer>;
  /** World position of the view's subject (the local player), if known (camera, audio pan). */
  local: { x: number; y: number } | null;
  /** Where each carrier's hands hold the folder, published by the avatars for the folder layer. */
  readonly hands: Map<string, HandAnchor>;
};

export function createRenderState(): RenderState {
  return { players: new Map<string, RenderedPlayer>(), local: null, hands: new Map() };
}

/** The player view's render state. */
export const renderState: RenderState = createRenderState();
