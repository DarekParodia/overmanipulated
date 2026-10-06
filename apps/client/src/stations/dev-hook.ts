// Debug-only fixture handle (`?debug`): lets e2e scripts and developers put a station in its
// minigame phase or a folder on a desk without the full simulation. `holdSnapshots()` stops
// snapshots from overwriting the injected folders/stations/desks; `emit()` replays a gameplay
// event as if it came from the server.
import { type GameplayEvent, handleGameEvent } from '../net/game-events.ts';
import { type GameStore, useGame } from '../net/game-store.ts';
import { useApp } from '../store/app.ts';

export type GameDevHandle = {
  getState(): GameStore;
  setState(partial: Partial<GameStore>): void;
  playerId(): string | null;
  /** Keep the injected folders, stations and desks; snapshots still update the clock. */
  holdSnapshots(): void;
  emit(event: GameplayEvent): void;
};

declare global {
  interface Window {
    __game?: GameDevHandle;
  }
}

export function installGameDevHandle(): void {
  if (typeof window === 'undefined' || window.__game) {
    return;
  }
  if (!new URLSearchParams(window.location.search).has('debug')) {
    return;
  }
  window.__game = {
    getState: () => useGame.getState(),
    setState: (partial) => useGame.setState(partial),
    playerId: () => useApp.getState().playerId,
    holdSnapshots() {
      useGame.setState({
        applySnapshot(snapshot) {
          useGame.setState({
            tick: snapshot.tick,
            elapsedMs: snapshot.elapsedMs,
            timeLeftMs: snapshot.timeLeftMs,
          });
        },
      });
    },
    emit: handleGameEvent,
  };
}
