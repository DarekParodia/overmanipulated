// Dev-only handle for driving gameplay UI and visuals without server gameplay (?debug only).
// - `inject({ folders, stations, desks })` sets that state and keeps it pinned over incoming
//   snapshots until `release()` (snapshots still update the clock, score and timer).
// - `holdSnapshots()` pins whatever folders/stations/desks are in the store right now.
// - `setState()` / `getState()` reach the game store directly; `emit()` replays a gameplay event
//   as if it came from the server; `map()` / `localPlayerId()` describe this client.
import type { Desk, Folder, Station, TileMap } from '@redakcja/shared';
import { type GameplayEvent, handleGameEvent } from '../net/game-events.ts';
import { type GameStore, useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useApp } from '../store/app.ts';

type Pinned = Partial<{ folders: Folder[]; stations: Station[]; desks: Desk[] }>;

export type GameHook = {
  store: typeof useGame;
  getState(): GameStore;
  setState(partial: Partial<GameStore>): void;
  map(): TileMap;
  localPlayerId(): string | null;
  /** Alias of `localPlayerId`. */
  playerId(): string | null;
  inject(state: Pinned): void;
  holdSnapshots(): void;
  release(): void;
  emit(event: GameplayEvent): void;
};

let installed = false;

export function installGameHook(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  if (!new URLSearchParams(window.location.search).has('debug')) {
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
  const localPlayerId = () => useApp.getState().playerId;
  const hook: GameHook = {
    store: useGame,
    getState: () => useGame.getState(),
    setState: (partial) => useGame.setState(partial),
    map: () => runtime.map,
    localPlayerId,
    playerId: localPlayerId,
    inject(state) {
      pinned = { ...pinned, ...state };
      useGame.setState(state);
    },
    holdSnapshots() {
      const { folders, stations, desks } = useGame.getState();
      pinned = { folders: [...folders], stations: [...stations], desks: [...desks] };
    },
    release() {
      pinned = {};
    },
    emit: handleGameEvent,
  };
  (window as unknown as { __game?: GameHook }).__game = hook;
}
