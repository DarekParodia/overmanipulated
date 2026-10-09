// Level events (S4-05..S4-09): viral, bossCall, botRaid, outage, correction.
// Starts scheduled events, ends the ones that are over and expires botRaid waves together.
// Emits: levelEvent (start/end), folderSpawned and folderExpired (for the rest of a raid wave).
// Verdict handling of tagged folders lives in desk.ts; raid expiry accounting in scoring.ts;
// the outage countdown in stations.ts.
import { EVENTS } from '../constants.ts';
import type { Folder, FolderTag } from '../entities.ts';
import type { SimLevelEvent } from './content.ts';
import { freeConveyors, spawnFolderAt } from './folders.ts';
import type { SimFrame } from './frame.ts';
import { applyCredibility } from './scoring.ts';
import type { ActiveEvent, GameState } from './state.ts';

/** Shares shown on a viral folder at level time `nowMs` (0 for folders that are not viral). */
export function viralShares(folder: Pick<Folder, 'tag' | 'spawnedAtMs'>, nowMs: number): number {
  if (folder.tag?.kind !== 'viral') {
    return 0;
  }
  const ageS = Math.max(0, nowMs - folder.spawnedAtMs) / 1000;
  return Math.round(EVENTS.viralSharesStart * EVENTS.viralGrowthPerS ** ageS);
}

/** Credibility a filed correction gives back (half the loss by default). */
export const CORRECTION_RECOVER = Math.round(
  EVENTS.correctionCredibilityLoss * EVENTS.correctionRecoverFraction,
);

/** Removes an active event and announces its end. Used by desk.ts and scoring.ts as well. */
export function endActiveEvent(state: GameState, frame: SimFrame, event: ActiveEvent): GameState {
  frame.events.push({
    kind: 'levelEvent',
    event: event.kind,
    phase: 'end',
    folderIds: event.folderIds,
  });
  return { ...state, activeEvents: state.activeEvents.filter((e) => e !== event) };
}

/** The active botRaid wave a folder belongs to, if any. */
export function raidOfFolder(state: GameState, folderId: string): ActiveEvent | undefined {
  return state.activeEvents.find((e) => e.kind === 'botRaid' && e.folderIds.includes(folderId));
}

function tagFor(
  event: Exclude<SimLevelEvent, { kind: 'outage' }>,
  state: GameState,
  index: number,
): FolderTag {
  switch (event.kind) {
    case 'viral':
      return { kind: 'viral' };
    case 'bossCall':
      return { kind: 'bossCall', untilMs: state.elapsedMs + EVENTS.bossCallWindowMs };
    case 'botRaid':
      return { kind: 'botRaid', raidId: `raid${index + 1}` };
    case 'correction':
      return { kind: 'correction', recoverCredibility: CORRECTION_RECOVER };
  }
}

export function stepEvents(state: GameState, frame: SimFrame): GameState {
  let next = expireRaids(state, frame);
  next = endFinishedEvents(next, frame);
  return startDueEvents(next, frame);
}

/** The first expired sibling takes the whole wave with it; scoring then counts it once. */
function expireRaids(state: GameState, frame: SimFrame): GameState {
  const expiredIds = new Set<string>();
  for (const event of frame.events) {
    if (event.kind === 'folderExpired') {
      expiredIds.add(event.folderId);
    }
  }
  if (expiredIds.size === 0) {
    return state;
  }
  let folders = state.folders;
  for (const raid of state.activeEvents) {
    if (raid.kind !== 'botRaid' || !raid.folderIds.some((id) => expiredIds.has(id))) {
      continue;
    }
    for (const id of raid.folderIds) {
      const folder = folders[id];
      if (!folder) {
        continue;
      }
      const { [id]: _gone, ...rest } = folders;
      folders = rest;
      frame.events.push({
        kind: 'folderExpired',
        folderId: id,
        storyId: folder.storyId,
        stamps: [...folder.stamps],
      });
    }
  }
  return folders === state.folders ? state : { ...state, folders };
}

/** Viral, bossCall and correction end when their folder is gone (or the demand lapses). */
function endFinishedEvents(state: GameState, frame: SimFrame): GameState {
  let next = state;
  for (const event of state.activeEvents) {
    if (event.kind === 'botRaid') {
      continue; // resolved in desk.ts, expired in scoring.ts
    }
    const gone = event.folderIds.every((id) => !(id in next.folders));
    const lapsed = event.kind === 'bossCall' && next.elapsedMs >= (event.untilMs ?? 0);
    if (gone || lapsed) {
      next = endActiveEvent(next, frame, event);
    }
  }
  return next;
}

function startDueEvents(state: GameState, frame: SimFrame): GameState {
  const events = frame.ctx.level.events ?? [];
  let next = state;
  while (next.nextEventIndex < events.length) {
    const index = next.nextEventIndex;
    const event = events[index];
    if (!event || next.elapsedMs < Math.round(event.atS * 1000)) {
      break;
    }
    if (event.kind === 'outage') {
      next = startOutage(next, frame, event);
    } else {
      const started = startFolderEvent(next, frame, event, index);
      if (!started) {
        break; // conveyor full: wait for tiles, never skip
      }
      next = started;
    }
    next = { ...next, nextEventIndex: index + 1 };
  }
  return next;
}

function startOutage(
  state: GameState,
  frame: SimFrame,
  event: Extract<SimLevelEvent, { kind: 'outage' }>,
): GameState {
  const station = Object.values(state.stations).find((s) => s.kind === event.station);
  if (!station) {
    return state;
  }
  const durationMs = Math.round(event.durationS * 1000) || EVENTS.outageDefaultMs;
  frame.events.push({
    kind: 'levelEvent',
    event: 'outage',
    phase: 'start',
    folderIds: [],
    stationId: station.id,
    durationMs,
  });
  return {
    ...state,
    stations: {
      ...state.stations,
      [station.id]: { ...station, outageMs: Math.max(station.outageMs, durationMs) },
    },
  };
}

/** Returns null when the conveyor has no room yet. An unknown story is skipped. */
function startFolderEvent(
  state: GameState,
  frame: SimFrame,
  event: Exclude<SimLevelEvent, { kind: 'outage' }>,
  index: number,
): GameState | null {
  if (!frame.ctx.stories[event.storyId]) {
    return state;
  }
  const tiles = freeConveyors(state, frame.ctx.map);
  const total = frame.ctx.map.fixtures.filter((f) => f.kind === 'conveyor').length;
  const wanted = event.kind === 'botRaid' ? Math.min(event.count, total) : 1;
  if (tiles.length < wanted || wanted === 0) {
    return null;
  }
  const tag = tagFor(event, state, index);
  let next = state;
  const folderIds: string[] = [];
  for (const tile of tiles.slice(0, wanted)) {
    folderIds.push(`f${next.nextFolderNumber}`);
    next = spawnFolderAt(next, frame, tile, {
      storyId: event.storyId,
      deadlineS: event.deadlineS,
      tag,
    });
  }
  const active: ActiveEvent = {
    kind: event.kind,
    folderIds,
    ...(tag.kind === 'botRaid' ? { raidId: tag.raidId } : {}),
    ...(tag.kind === 'bossCall' ? { untilMs: tag.untilMs } : {}),
  };
  next = { ...next, activeEvents: [...next.activeEvents, active] };
  if (event.kind === 'correction') {
    next = {
      ...next,
      credibility: applyCredibility(next.credibility, -EVENTS.correctionCredibilityLoss),
    };
  }
  frame.events.push({ kind: 'levelEvent', event: event.kind, phase: 'start', folderIds });
  return next;
}
