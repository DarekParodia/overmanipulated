// Routes gameplay events from the server to feedback (cues) and to UI listeners (toasts,
// overlays, ping bubbles) of one GameView (net/game-view.ts, S7-85). Player join/leave events are
// handled in session.ts; everything else lands here. Which cue each event plays lives in
// fx/event-cues.ts; this file adds where it happens (world position from the fixture, folder or
// player, read from the view's own map, store and render state) and who it is about.
import { getStory } from '@redakcja/content';
import {
  type Folder,
  type FolderLocation,
  fixtureById,
  type SnapshotMessage,
  type TileMap,
  tileCenter,
} from '@redakcja/shared';
import type { CueId } from '../fx/cues.ts';
import { cueForEvent, type GameplayEvent, verdictColors } from '../fx/event-cues.ts';
import type { CueContext, Feedback } from '../fx/feedback.ts';
import type { RenderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { playerColor } from '../ui/tokens.ts';

export type { GameplayEvent } from '../fx/event-cues.ts';

export type GameEventListener = (event: GameplayEvent) => void;

/** Listeners of one view's gameplay events. */
export type GameEventBus = {
  /** Subscribes to every gameplay event; returns the unsubscribe function. */
  on(listener: GameEventListener): () => void;
  emit(event: GameplayEvent): void;
};

export function createGameEventBus(): GameEventBus {
  const listeners = new Set<GameEventListener>();
  return {
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

/** The player view's gameplay events. */
export const playerEvents: GameEventBus = createGameEventBus();

/** Subscribes to the player view's gameplay events; returns the unsubscribe function. */
export function onGameEvent(listener: GameEventListener): () => void {
  return playerEvents.on(listener);
}

/** What `contextFor` reads of a view to place an event in its world. */
export type ViewLookup = {
  readonly runtime: {
    readonly map: TileMap;
    readonly buffer: { latest(): SnapshotMessage | null };
  };
  readonly store: { getState(): { readonly folders: readonly Folder[] } };
  readonly render: RenderState;
  /** The view's local player (player view) or followed player (spectator view). */
  subjectId(): string | null;
  /** The view's own players (the intro); the room's when left out. */
  readonly roster?: readonly { id: string; colorIndex: number }[];
};

/** A view events are routed to: its lookup, its listeners and its feedback. */
export type EventView = ViewLookup & { readonly bus: GameEventBus; readonly feedback: Feedback };

/**
 * Delivers one gameplay event to a view: its listeners first, then its cue. `audible` decides
 * which cues keep their sound; the others play silently (a spectator's view, S7-90).
 */
export function routeViewEvent(
  view: EventView,
  event: GameplayEvent,
  audible: (cue: CueId) => boolean = () => true,
): void {
  view.bus.emit(event);
  const cue = cueForEvent(event, (storyId) => getStory(storyId)?.truth, view.subjectId());
  if (cue !== null) {
    const context = contextFor(view, event);
    view.feedback.emit(cue, audible(cue) ? context : { ...context, silent: true });
  }
}

// --- World positions -----------------------------------------------------------------------

type Point = { x: number; y: number };

function fixturePosition(view: ViewLookup, fixtureId: string): Point | undefined {
  const fixture = fixtureById(view.runtime.map, fixtureId);
  return fixture ? tileCenter(fixture.col, fixture.row) : undefined;
}

function playerPosition(view: ViewLookup, playerId: string): Point | undefined {
  const rendered = view.render.players.get(playerId);
  if (rendered) {
    return { x: rendered.x, y: rendered.y };
  }
  const snapshot = view.runtime.buffer.latest()?.players.find((p) => p.id === playerId);
  return snapshot ? { x: snapshot.x, y: snapshot.y } : undefined;
}

function locationPosition(view: ViewLookup, location: FolderLocation): Point | undefined {
  switch (location.kind) {
    case 'carried':
      return playerPosition(view, location.playerId);
    case 'fixture':
      return fixturePosition(view, location.fixtureId);
    case 'floor':
      return { x: location.x, y: location.y };
  }
}

function folderPosition(view: ViewLookup, folderId: string): Point | undefined {
  const folder = view.store.getState().folders.find((f) => f.id === folderId);
  return folder ? locationPosition(view, folder.location) : undefined;
}

/** Context for a cue about a player: their colour, and whether they are someone else. */
function aboutPlayer(view: ViewLookup, playerId: string): CueContext {
  const players = view.roster ?? useApp.getState().room?.players;
  const colorIndex = players?.find((p) => p.id === playerId)?.colorIndex ?? 0;
  return { playerId, color: playerColor(colorIndex), remote: playerId !== view.subjectId() };
}

function at(position: Point | undefined): CueContext {
  return position ? { position } : {};
}

/** Where the local player stands: the fallback place for events that belong to the whole room. */
function fallbackPosition(view: ViewLookup): Point | undefined {
  return view.render.local ?? undefined;
}

/**
 * Where a level event bursts: on its station (outage), its first folder, the first editorial
 * desk for the boss call (the phone rings there), else at the local player.
 */
function levelEventContext(
  view: ViewLookup,
  event: Extract<GameplayEvent, { kind: 'levelEvent' }>,
): CueContext {
  const folderId = event.folderIds[0];
  const desk = view.runtime.map.fixtures.find((f) => f.kind === 'desk');
  const position =
    (event.stationId ? fixturePosition(view, event.stationId) : undefined) ??
    (event.event === 'bossCall' && desk ? fixturePosition(view, desk.id) : undefined) ??
    (folderId ? folderPosition(view, folderId) : undefined) ??
    fallbackPosition(view);
  return {
    ...at(position),
    ...(folderId ? { folderId } : {}),
    ...(event.stationId ? { fixtureId: event.stationId } : {}),
  };
}

/** Context for an event at a station the player operates (minigame round and its stamp). */
function stationContext(
  view: ViewLookup,
  event: Extract<GameplayEvent, { kind: 'minigameStarted' | 'minigameFailed' | 'stampApplied' }>,
): CueContext {
  return {
    ...aboutPlayer(view, event.playerId),
    ...at(fixturePosition(view, event.stationId)),
    fixtureId: event.stationId,
    folderId: event.folderId,
    loopKey: event.stationId,
  };
}

/** Where and about whom each event happens, in the given view's world. */
export function contextFor(view: ViewLookup, event: GameplayEvent): CueContext {
  switch (event.kind) {
    case 'folderSpawned':
      return {
        ...at(fixturePosition(view, event.fixtureId)),
        folderId: event.folderId,
        fixtureId: event.fixtureId,
      };
    case 'folderPickedUp':
      return {
        ...aboutPlayer(view, event.playerId),
        ...at(playerPosition(view, event.playerId)),
        folderId: event.folderId,
      };
    case 'folderPutDown':
      return {
        ...aboutPlayer(view, event.playerId),
        ...at(locationPosition(view, event.location)),
        folderId: event.folderId,
        ...(event.location.kind === 'fixture' ? { fixtureId: event.location.fixtureId } : {}),
      };
    case 'deadlineWarning':
    case 'folderExpired':
      return { ...at(folderPosition(view, event.folderId)), folderId: event.folderId };
    case 'workStarted':
    case 'workCancelled':
      return {
        ...aboutPlayer(view, event.playerId),
        ...at(fixturePosition(view, event.stationId)),
        fixtureId: event.stationId,
        loopKey: event.stationId,
      };
    case 'stampApplied':
      if (event.via === 'fieldCall') {
        // Telefon z terenu stamps the folder in the reporter's hands, not at the phone station.
        return {
          ...aboutPlayer(view, event.playerId),
          ...at(playerPosition(view, event.playerId)),
          folderId: event.folderId,
        };
      }
      return stationContext(view, event);
    case 'minigameStarted':
    case 'minigameFailed':
      return stationContext(view, event);
    case 'deskOpened':
      return {
        ...aboutPlayer(view, event.playerId),
        ...at(fixturePosition(view, event.deskId)),
        fixtureId: event.deskId,
        folderId: event.folderId,
      };
    case 'deskClosed':
      return {
        ...aboutPlayer(view, event.playerId),
        ...at(fixturePosition(view, event.deskId)),
        fixtureId: event.deskId,
      };
    case 'verdictResult':
      // A verdict is a team outcome: everyone feels it (no `remote`), in the verdict's colour.
      return {
        ...at(folderPosition(view, event.folderId) ?? playerPosition(view, event.playerId)),
        playerId: event.playerId,
        folderId: event.folderId,
        color: verdictColors[event.verdict],
        value: event.scoreDelta,
      };
    case 'ping':
      return { ...aboutPlayer(view, event.playerId), ...at(playerPosition(view, event.playerId)) };
    case 'levelEvent':
      return levelEventContext(view, event);
    case 'raidResolved':
      return {
        ...at(folderPosition(view, event.byFolderId) ?? fallbackPosition(view)),
        folderId: event.byFolderId,
      };
    case 'ability':
      return abilityContext(view, event);
    case 'folderRescued':
      return {
        ...aboutPlayer(view, event.playerId),
        ...at(folderPosition(view, event.folderId) ?? playerPosition(view, event.playerId)),
        folderId: event.folderId,
      };
  }
}

/**
 * Where an ability lands: at its station (Ekspertyza, Druga szansa), at the player for a
 * Telefon z terenu call, else at its folder; the player's own position when nothing else is
 * known.
 */
function abilityContext(
  view: ViewLookup,
  event: Extract<GameplayEvent, { kind: 'ability' }>,
): CueContext {
  const position =
    (event.stationId ? fixturePosition(view, event.stationId) : undefined) ??
    (event.ability !== 'fieldCall' && event.folderId
      ? folderPosition(view, event.folderId)
      : undefined) ??
    playerPosition(view, event.playerId);
  return {
    ...aboutPlayer(view, event.playerId),
    ...at(position),
    ...(event.folderId ? { folderId: event.folderId } : {}),
    ...(event.stationId ? { fixtureId: event.stationId } : {}),
  };
}
