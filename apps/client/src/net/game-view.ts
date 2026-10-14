// A GameView (S7-85) is everything one rendered newsroom reads and writes: its runtime (map and
// players), game store, level-event store, ping bubbles, guidance, per-frame render state,
// particle pool, camera shake and feedback dispatcher, plus the listeners of its gameplay events.
// The scene and its overlays reach these only through the view in React context
// (net/view-context.tsx), so two views can render side by side (spectators, S7-90) and a local
// sim can render in its own (the intro, S7-101). The local player's view is `playerView`
// (net/session.ts), made from the module-level stores, so play needs no setup.
import type { LobbyPlayer, TeamIndex } from '@redakcja/shared';
import { createEventStore, type EventStoreApi } from '../events/event-store.ts';
import { createViewCamera, type ViewCamera } from '../fx/camera/view-camera.ts';
import { createViewFeedback, type Feedback } from '../fx/feedback.ts';
import { createViewParticles, type ViewParticles } from '../fx/particles/view-particles.ts';
import { createDisabledGuidance, type GuidanceStoreApi } from '../guidance/store.ts';
import { type BubbleStoreApi, createBubbleStore } from '../pings/bubble-store.ts';
import { createRenderState, type RenderState } from '../scene/render-state.ts';
import { createGameEventBus, type GameEventBus } from './game-events.ts';
import { createGameStore, type GameStoreApi } from './game-store.ts';
import { createWatchRuntime, type ViewRuntime } from './runtime.ts';

/** `intro`: the intro's local sim (S7-101), a scripted reporter watched like a spectator. */
export type GameViewKind = 'player' | 'spectator' | 'intro';

export type GameView = {
  readonly kind: GameViewKind;
  /** The newsroom this view shows (0 in co-op). */
  readonly team: TeamIndex;
  readonly runtime: ViewRuntime;
  readonly store: GameStoreApi;
  readonly events: EventStoreApi;
  readonly bubbles: BubbleStoreApi;
  /** The player's guidance, or a disabled stub for a spectator view. */
  readonly guidance: GuidanceStoreApi;
  readonly render: RenderState;
  readonly particles: ViewParticles;
  readonly camera: ViewCamera;
  readonly feedback: Feedback;
  /** Listeners of this view's gameplay events (net/game-events.ts `routeViewEvent`). */
  readonly bus: GameEventBus;
  /** The local player (player view) or the followed player (spectator view), if any. */
  subjectId(): string | null;
  /**
   * Its own players and level, for a view that is not of the room (the intro, S7-101); left
   * out, the scene draws the room's players and the room's level theme.
   */
  readonly roster?: readonly LobbyPlayer[];
  readonly levelId?: string;
};

/** What a view must be given; every store left out is created fresh for it. */
export type GameViewParts = Pick<
  GameView,
  'kind' | 'team' | 'runtime' | 'subjectId' | 'roster' | 'levelId'
> &
  Partial<
    Pick<
      GameView,
      | 'store'
      | 'events'
      | 'bubbles'
      | 'guidance'
      | 'render'
      | 'particles'
      | 'camera'
      | 'feedback'
      | 'bus'
    >
  >;

export function createGameView(parts: GameViewParts): GameView {
  return {
    kind: parts.kind,
    team: parts.team,
    runtime: parts.runtime,
    subjectId: parts.subjectId,
    store: parts.store ?? createGameStore(),
    events: parts.events ?? createEventStore(),
    bubbles: parts.bubbles ?? createBubbleStore(),
    guidance: parts.guidance ?? createDisabledGuidance(),
    render: parts.render ?? createRenderState(),
    particles: parts.particles ?? createViewParticles(),
    camera: parts.camera ?? createViewCamera(),
    feedback: parts.feedback ?? createViewFeedback(),
    bus: parts.bus ?? createGameEventBus(),
    ...(parts.roster ? { roster: parts.roster } : {}),
    ...(parts.levelId ? { levelId: parts.levelId } : {}),
  };
}

/**
 * A spectator's view of one team (S7-90): a watch runtime rendering
 * SPECTATOR_INTERPOLATION_DELAY_MS behind, fresh stores, guidance off.
 */
export function createWatchView(
  team: TeamIndex,
  levelId?: string,
  subjectId: () => string | null = () => null,
): GameView {
  return createGameView({
    kind: 'spectator',
    team,
    runtime: createWatchRuntime(levelId),
    subjectId,
  });
}
