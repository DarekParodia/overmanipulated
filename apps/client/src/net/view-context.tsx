// The GameView in React context (S7-85). Scene components and their overlays read their view
// with `useGameView()`; without a provider that is the local player's view, so the game screen
// needs no setup. Separate React roots (useOverlay layers, drei Html children) do not inherit
// context, so each wraps its content in `GameViewProvider` again; each Canvas renders one too
// rather than relying on R3F's context bridging.
import type { LobbyPlayer } from '@redakcja/shared';
import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import { useApp } from '../store/app.ts';
import type { GameStore } from './game-store.ts';
import type { GameView } from './game-view.ts';
import { playerView } from './session.ts';

export const GameViewContext = createContext<GameView | null>(null);

export function GameViewProvider({ view, children }: { view: GameView; children?: ReactNode }) {
  return <GameViewContext.Provider value={view}>{children}</GameViewContext.Provider>;
}

/** The view this component renders: the nearest provider's, else the local player's. */
export function useGameView(): GameView {
  return useContext(GameViewContext) ?? playerView;
}

/** A slice of the view's game store, re-rendering when it changes. */
export function useViewGame<T>(selector: (state: GameStore) => T): T {
  return useStore(useGameView().store, selector);
}

const NO_PLAYERS: readonly LobbyPlayer[] = [];

/** The players a view draws: its own roster (the intro), else the room's. */
export function viewRoster(view: Pick<GameView, 'roster'>): readonly LobbyPlayer[] {
  return view.roster ?? useApp.getState().room?.players ?? NO_PLAYERS;
}

/** `viewRoster` as a hook: re-renders when the room's players change. */
export function useViewRoster(): readonly LobbyPlayer[] {
  const view = useGameView();
  const roomPlayers = useApp((s) => s.room?.players);
  return view.roster ?? roomPlayers ?? NO_PLAYERS;
}

/** The level whose theme a view wears: its own (the intro), else the room's. */
export function viewLevelId(view: Pick<GameView, 'levelId'>): string {
  return view.levelId ?? useApp.getState().room?.levelId ?? '';
}
