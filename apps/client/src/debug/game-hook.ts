// Dev-only handle for driving gameplay UI and visuals without server gameplay (?debug only).
// - `inject({ folders, stations, desks, nextFolder, conveyorFull })` sets that state and keeps it
//   pinned over incoming snapshots until `release()` (snapshots still update the clock, score
//   and timer).
// - `holdSnapshots()` pins whatever folders/stations/desks and next-folder state are in the store
//   right now.
// - `setState()` / `getState()` reach the game store directly; `emit()` replays a gameplay event
//   as if it came from the server; `send()` sends a real command to the server;
//   `map()` / `localPlayerId()` describe this client.
// - `pauseScene()` stops drawing the 3D scene for good (the frame loop, input and snapshots run
//   on). For end-to-end tests of 2D overlays on software WebGL: a hidden canvas that still draws
//   gives the GPU process no back-pressure, so it queues frames it cannot draw and every later
//   browser context waits for that backlog (tens of seconds under load).
import type { Desk, Folder, NextFolder, PlayerCommand, Station, TileMap } from '@redakcja/shared';
import type { WebGLRenderer } from 'three';
import type { GameplayEvent } from '../net/game-events.ts';
import { type GameStore, useGame } from '../net/game-store.ts';
import { handleGameEvent, runtime, sendCommand } from '../net/session.ts';
import { useApp } from '../store/app.ts';

type Pinned = Partial<{
  folders: Folder[];
  stations: Station[];
  desks: Desk[];
  nextFolder: NextFolder | null;
  conveyorFull: boolean;
}>;

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
  /** Sends a player command to the server, e.g. a minigame result in scripted playtests. */
  send(command: PlayerCommand): void;
  /** Stops drawing the 3D scene until the page reloads; everything else runs on. */
  pauseScene(): void;
};

let installed = false;
/** The primary canvas's renderer (`registerSceneRenderer`), for `pauseScene()`. */
let sceneRenderer: WebGLRenderer | null = null;
let scenePaused = false;

function stopDrawing(): void {
  if (scenePaused && sceneRenderer) {
    sceneRenderer.render = () => {};
  }
}

/**
 * Called by the primary game canvas under ?debug, so the hook can pause its drawing (also when
 * `pauseScene()` came first: the hook installs with the station layer, maybe before the canvas).
 */
export function registerSceneRenderer(renderer: WebGLRenderer): void {
  sceneRenderer = renderer;
  stopDrawing();
}

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
  // One store update per snapshot, pinned fields included: a pinned flag never flips back for
  // a moment, so state-driven cues (e.g. the full-belt alert) fire once, not on every snapshot.
  const wrapped: GameStore['applySnapshot'] = (snapshot) => {
    applySnapshot({ ...snapshot, ...pinned });
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
      const { folders, stations, desks, nextFolder, conveyorFull } = useGame.getState();
      pinned = {
        folders: [...folders],
        stations: [...stations],
        desks: [...desks],
        nextFolder,
        conveyorFull,
      };
    },
    release() {
      pinned = {};
    },
    emit: handleGameEvent,
    send: sendCommand,
    pauseScene() {
      scenePaused = true;
      stopDrawing();
    },
  };
  (window as unknown as { __game?: GameHook }).__game = hook;
}
