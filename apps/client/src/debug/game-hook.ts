// Dev-only handle for driving gameplay visuals without server gameplay (?debug only).
// `window.__game.inject({ folders, stations, desks })` sets that state and keeps it pinned over
// incoming snapshots until `release()`; `map()` returns the current tile map (fixture ids),
// `localPlayerId()` this client's player id.
import type { Desk, Folder, Station, TileMap } from '@redakcja/shared';
import { type GameStore, useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useApp } from '../store/app.ts';

type Pinned = Partial<{ folders: Folder[]; stations: Station[]; desks: Desk[] }>;

export type GameHook = {
  store: typeof useGame;
  map(): TileMap;
  localPlayerId(): string | null;
  inject(state: Pinned): void;
  release(): void;
};

let installed = false;

export function installGameHook(): void {
  if (installed) {
    return;
  }
  installed = true;
  let pinned: Pinned = {};
  const applySnapshot = useGame.getState().applySnapshot;
  const wrapped: GameStore['applySnapshot'] = (snapshot) => {
    applySnapshot(snapshot);
    if (Object.keys(pinned).length > 0) {
      useGame.setState(pinned);
    }
  };
  const reset = useGame.getState().reset;
  useGame.setState({
    applySnapshot: wrapped,
    // A new level drops the injected state.
    reset() {
      pinned = {};
      reset();
    },
  });
  const hook: GameHook = {
    store: useGame,
    map: () => runtime.map,
    localPlayerId: () => useApp.getState().playerId,
    inject(state) {
      pinned = { ...pinned, ...state };
      useGame.setState(state);
    },
    release() {
      pinned = {};
    },
  };
  (window as unknown as { __game?: GameHook }).__game = hook;
}
