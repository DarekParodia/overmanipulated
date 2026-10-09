// Routes gameplay events from the server to feedback (cues) and to UI listeners (toasts,
// overlays, ping bubbles). Player join/leave events are handled in session.ts; everything else
// lands here. Which cue each event plays lives in fx/event-cues.ts; this file adds where it
// happens (world position from the fixture, folder or player) and who it is about.
import { getStory } from '@redakcja/content';
import { type FolderLocation, fixtureById, tileCenter } from '@redakcja/shared';
import { cueForEvent, type GameplayEvent, verdictColors } from '../fx/event-cues.ts';
import { type CueContext, emitCue } from '../fx/feedback.ts';
import { renderState } from '../scene/render-state.ts';
import { useApp } from '../store/app.ts';
import { useSettings } from '../store/settings.ts';
import { playerColor } from '../ui/tokens.ts';
import { useGame } from './game-store.ts';
import { runtime } from './session.ts';

export type { GameplayEvent } from '../fx/event-cues.ts';

export type GameEventListener = (event: GameplayEvent) => void;

const listeners = new Set<GameEventListener>();

/** Subscribes to every gameplay event; returns the unsubscribe function. */
export function onGameEvent(listener: GameEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function handleGameEvent(event: GameplayEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
  playEventCue(event);
}

// --- World positions -----------------------------------------------------------------------

type Point = { x: number; y: number };

function fixturePosition(fixtureId: string): Point | undefined {
  const fixture = fixtureById(runtime.map, fixtureId);
  return fixture ? tileCenter(fixture.col, fixture.row) : undefined;
}

function playerPosition(playerId: string): Point | undefined {
  const rendered = renderState.players.get(playerId);
  if (rendered) {
    return { x: rendered.x, y: rendered.y };
  }
  const snapshot = runtime.buffer.latest()?.players.find((p) => p.id === playerId);
  return snapshot ? { x: snapshot.x, y: snapshot.y } : undefined;
}

function locationPosition(location: FolderLocation): Point | undefined {
  switch (location.kind) {
    case 'carried':
      return playerPosition(location.playerId);
    case 'fixture':
      return fixturePosition(location.fixtureId);
    case 'floor':
      return { x: location.x, y: location.y };
  }
}

function folderPosition(folderId: string): Point | undefined {
  const folder = useGame.getState().folders.find((f) => f.id === folderId);
  return folder ? locationPosition(folder.location) : undefined;
}

/** Context for a cue about a player: their colour, and whether they are someone else. */
function aboutPlayer(playerId: string): CueContext {
  const app = useApp.getState();
  const colorIndex = app.room?.players.find((p) => p.id === playerId)?.colorIndex ?? 0;
  return { playerId, color: playerColor(colorIndex), remote: playerId !== app.playerId };
}

function at(position: Point | undefined): CueContext {
  return position ? { position } : {};
}

/** Where the local player stands: the fallback place for events that belong to the whole room. */
function fallbackPosition(): Point | undefined {
  return renderState.local ?? undefined;
}

/**
 * Where a level event bursts: on its station (outage), its first folder, the first editorial
 * desk for the boss call (the phone rings there), else at the local player.
 */
function levelEventContext(event: Extract<GameplayEvent, { kind: 'levelEvent' }>): CueContext {
  const folderId = event.folderIds[0];
  const desk = runtime.map.fixtures.find((f) => f.kind === 'desk');
  const position =
    (event.stationId ? fixturePosition(event.stationId) : undefined) ??
    (event.event === 'bossCall' && desk ? fixturePosition(desk.id) : undefined) ??
    (folderId ? folderPosition(folderId) : undefined) ??
    fallbackPosition();
  return {
    ...at(position),
    ...(folderId ? { folderId } : {}),
    ...(event.stationId ? { fixtureId: event.stationId } : {}),
  };
}

/** Where and about whom each event happens. */
function contextFor(event: GameplayEvent): CueContext {
  switch (event.kind) {
    case 'folderSpawned':
      return {
        ...at(fixturePosition(event.fixtureId)),
        folderId: event.folderId,
        fixtureId: event.fixtureId,
      };
    case 'folderPickedUp':
      return {
        ...aboutPlayer(event.playerId),
        ...at(playerPosition(event.playerId)),
        folderId: event.folderId,
      };
    case 'folderPutDown':
      return {
        ...aboutPlayer(event.playerId),
        ...at(locationPosition(event.location)),
        folderId: event.folderId,
        ...(event.location.kind === 'fixture' ? { fixtureId: event.location.fixtureId } : {}),
      };
    case 'deadlineWarning':
    case 'folderExpired':
      return { ...at(folderPosition(event.folderId)), folderId: event.folderId };
    case 'deadlineExtended':
      return {
        ...aboutPlayer(event.playerId),
        ...at(folderPosition(event.folderId)),
        folderId: event.folderId,
      };
    case 'workStarted':
    case 'workCancelled':
      return {
        ...aboutPlayer(event.playerId),
        ...at(fixturePosition(event.stationId)),
        fixtureId: event.stationId,
        loopKey: event.stationId,
      };
    case 'minigameStarted':
    case 'minigameFailed':
    case 'stampApplied':
      return {
        ...aboutPlayer(event.playerId),
        ...at(fixturePosition(event.stationId)),
        fixtureId: event.stationId,
        folderId: event.folderId,
        loopKey: event.stationId,
      };
    case 'deskOpened':
      return {
        ...aboutPlayer(event.playerId),
        ...at(fixturePosition(event.deskId)),
        fixtureId: event.deskId,
        folderId: event.folderId,
      };
    case 'deskClosed':
      return {
        ...aboutPlayer(event.playerId),
        ...at(fixturePosition(event.deskId)),
        fixtureId: event.deskId,
      };
    case 'verdictResult':
      // A verdict is a team outcome: everyone feels it (no `remote`), in the verdict's colour.
      return {
        ...at(folderPosition(event.folderId) ?? playerPosition(event.playerId)),
        playerId: event.playerId,
        folderId: event.folderId,
        color: verdictColors[event.verdict],
        value: event.scoreDelta,
      };
    case 'ping':
      return { ...aboutPlayer(event.playerId), ...at(playerPosition(event.playerId)) };
    case 'levelEvent':
      return levelEventContext(event);
    case 'raidResolved':
      return {
        ...at(folderPosition(event.byFolderId) ?? fallbackPosition()),
        folderId: event.byFolderId,
      };
  }
}

/** Feedback for each gameplay event. */
function playEventCue(event: GameplayEvent): void {
  emitCue(
    cueForEvent(event, (storyId) => getStory(storyId)?.truth),
    contextFor(event),
  );
}

// Dev aid: fire events and cues from the console or end-to-end tests (`?debug`).
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __fx?: unknown }).__fx = {
    handleGameEvent,
    emitCue,
    useGame,
    useApp,
    useSettings,
  };
}
