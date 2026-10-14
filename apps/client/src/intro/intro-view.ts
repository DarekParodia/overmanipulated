// The intro's GameView (S7-101): the scene renders the local intro sim (intro-sim.ts) exactly as
// it renders a match, through its own view (S7-85), so nothing of the player's view or the room
// is touched. The runtime asks the intro player's clock which track and scene time to show,
// steps the sim up to it, feeds the view's game store and routes the events to the view's own
// feedback (particles, animations; no audio, haptics or captions are connected to it, so the
// narrator is never covered and nothing is announced twice). A jump (Back, Next, a restart, a
// scene opened directly) replays the track from its start silently.
import { type GameEvent, type LobbyPlayer, TICK_MS } from '@redakcja/shared';
import { type GameplayEvent, routeViewEvent } from '../net/game-events.ts';
import { createGameView, type GameView } from '../net/game-view.ts';
import type { RenderedPlayer, ViewRuntime } from '../net/runtime.ts';
import { createSnapshotBuffer, lerp, lerpAngle } from '../net/snapshot-buffer.ts';
import { pl } from '../strings/pl.ts';
import type { IntroTrackId } from './intro-script.ts';
import {
  createIntroRun,
  INTRO_MAP,
  INTRO_PLAYER_ID,
  INTRO_PLAYER_ROLE,
  type IntroRun,
  introSnapshot,
} from './intro-sim.ts';

/** What the stage shows now: a gameplay scene's track and its time, or nothing. */
export type IntroClock = { track: IntroTrackId; elapsedMs: number } | null;

/** More ticks than this in one frame is a jump: stepped silently, no feedback replayed. */
export const INTRO_MAX_LIVE_TICKS = 4;
/** The theme the mini newsroom wears: the training level's. */
export const INTRO_LEVEL_THEME = 'l0-greybox';

/** The reporter on stage, drawn like a room player (name tag, colour, role accessory). */
export const INTRO_ROSTER: readonly LobbyPlayer[] = [
  {
    id: INTRO_PLAYER_ID,
    nickname: pl.intro.reporter,
    colorIndex: 0,
    connected: true,
    role: INTRO_PLAYER_ROLE,
    ready: true,
    team: 0,
    accessory: 'none',
  },
];

const JOIN_EVENTS: ReadonlySet<GameEvent['kind']> = new Set([
  'playerJoined',
  'playerLeft',
  'playerReconnected',
  'gameStarted',
]);

function isGameplay(event: GameEvent): event is GameplayEvent {
  return !JOIN_EVENTS.has(event.kind);
}

export type IntroRuntime = ViewRuntime & {
  /** The run on stage (tests, the callouts' debug); null before the first gameplay scene. */
  readonly run: IntroRun | null;
};

/**
 * A runtime that plays the intro sim at the time `clock` reads. `onEvents` gets the events of
 * ticks stepped live (not of a jump); the view routes them to its feedback.
 */
export function createIntroRuntime(
  clock: () => IntroClock,
  onSnapshot: (run: IntroRun, fresh: boolean) => void,
  onEvents: (events: readonly GameEvent[]) => void,
): IntroRuntime {
  const buffer = createSnapshotBuffer();
  let run: IntroRun | null = null;
  let players = new Map<string, RenderedPlayer>();

  return {
    map: INTRO_MAP,
    buffer,
    get run() {
      return run;
    },
    onSnapshot() {
      // The intro has no server.
    },
    frame() {
      const target = clock();
      if (target === null) {
        return players;
      }
      const ticks = Math.max(0, Math.floor(target.elapsedMs / TICK_MS));
      let fresh = false;
      if (run === null || run.track !== target.track || ticks < run.tick) {
        run = createIntroRun(target.track);
        buffer.clear();
        fresh = true;
      }
      const live = ticks - run.tick <= INTRO_MAX_LIVE_TICKS && !fresh;
      const from = run.tick;
      const events: GameEvent[] = [];
      while (run.tick < ticks) {
        events.push(...run.advance());
      }
      if (fresh || run.tick !== from) {
        const snapshot = introSnapshot(run.state);
        buffer.push(snapshot, run.state.elapsedMs);
        onSnapshot(run, fresh);
      }
      if (live && events.length > 0) {
        onEvents(events);
      }
      const alpha = Math.min(1, Math.max(0, target.elapsedMs / TICK_MS - ticks));
      const next = new Map<string, RenderedPlayer>();
      for (const [id, now] of Object.entries(run.state.players)) {
        const before = run.previous.players[id] ?? now;
        next.set(id, {
          id,
          x: lerp(before.x, now.x, alpha),
          y: lerp(before.y, now.y, alpha),
          facing: lerpAngle(before.facing, now.facing, alpha),
          moving: now.moving,
          local: false,
        });
      }
      players = next;
      return players;
    },
    reset() {
      run = null;
      buffer.clear();
      players = new Map();
    },
  };
}

/** The intro's view: its runtime, fresh stores, guidance off, the scripted reporter followed. */
export function createIntroView(clock: () => IntroClock): GameView {
  let view: GameView | null = null;
  const runtime = createIntroRuntime(
    clock,
    (run, fresh) => {
      const store = view?.store.getState();
      if (fresh) {
        store?.reset();
      }
      store?.applySnapshot(introSnapshot(run.state));
    },
    (events) => {
      for (const event of events) {
        if (view && isGameplay(event)) {
          routeViewEvent(view, event);
        }
      }
    },
  );
  view = createGameView({
    kind: 'intro',
    team: 0,
    runtime,
    subjectId: () => INTRO_PLAYER_ID,
    roster: INTRO_ROSTER,
    levelId: INTRO_LEVEL_THEME,
  });
  return view;
}
