// Folders: spawning from the level schedule, pick up / put down, deadlines and expiry (S2-02).
// Emits: folderSpawned, folderPickedUp, folderPutDown, deadlineWarning, folderExpired.
// Expired folders are removed here; their score and credibility are applied in scoring.ts.
import {
  DEADLINE_WARNING_MS,
  FLOOR_DROP_DISTANCE_TILES,
  INTERACTION_REACH_TILES,
} from '../constants.ts';
import type { Folder, FolderLocation } from '../entities.ts';
import type { SimFrame } from './frame.ts';
import {
  type Fixture,
  findInteractionTarget,
  frontTile,
  isSolid,
  type TileMap,
  type Vec2,
} from './map.ts';
import { quantize } from './movement.ts';
import { carriedFolder, folderOnFixture, type GameState, type PlayerState } from './state.ts';

/**
 * Expiry runs first (a folder past its deadline cannot be picked up any more), then spawning,
 * then interactions, so a folder that arrives this tick can already be grabbed.
 */
export function stepFolders(state: GameState, frame: SimFrame): GameState {
  let next = checkDeadlines(state, frame);
  next = spawnFolders(next, frame);
  return interact(next, frame);
}

/** Deadline warning once per folder, then removal at the deadline (wherever the folder is). */
function checkDeadlines(state: GameState, frame: SimFrame): GameState {
  let folders: Record<string, Folder> | undefined;
  for (const folder of Object.values(state.folders)) {
    if (state.elapsedMs >= folder.deadlineMs) {
      folders ??= { ...state.folders };
      delete folders[folder.id];
      frame.events.push({ kind: 'folderExpired', folderId: folder.id, storyId: folder.storyId });
    } else if (!folder.warned && folder.deadlineMs - state.elapsedMs <= DEADLINE_WARNING_MS) {
      folders ??= { ...state.folders };
      folders[folder.id] = { ...folder, warned: true };
      frame.events.push({ kind: 'deadlineWarning', folderId: folder.id });
    }
  }
  return folders ? { ...state, folders } : state;
}

/**
 * Spawns every due schedule entry onto the first free conveyor tile. When the conveyor is full
 * the entry waits (and holds back later ones) until a tile frees up; it is never skipped.
 * Entries whose story is missing from the story book are skipped.
 */
function spawnFolders(state: GameState, frame: SimFrame): GameState {
  const { schedule } = frame.ctx.level;
  let next = state;
  while (next.nextSpawnIndex < schedule.length) {
    const entry = schedule[next.nextSpawnIndex];
    // Rounded to whole ms so fractional seconds in content (1.1 s) do not miss a tick.
    if (!entry || next.elapsedMs < Math.round(entry.atS * 1000)) {
      break;
    }
    if (!frame.ctx.stories[entry.storyId]) {
      next = { ...next, nextSpawnIndex: next.nextSpawnIndex + 1 };
      continue;
    }
    const current = next;
    const free = frame.ctx.map.fixtures.find(
      (f) => f.kind === 'conveyor' && !folderOnFixture(current, f.id),
    );
    if (!free) {
      break;
    }
    const folder: Folder = {
      id: `f${next.nextFolderNumber}`,
      storyId: entry.storyId,
      location: { kind: 'fixture', fixtureId: free.id },
      stamps: [],
      spawnedAtMs: next.elapsedMs,
      deadlineMs: next.elapsedMs + Math.round(entry.deadlineS * 1000),
      warned: false,
    };
    next = {
      ...next,
      folders: { ...next.folders, [folder.id]: folder },
      nextFolderNumber: next.nextFolderNumber + 1,
      nextSpawnIndex: next.nextSpawnIndex + 1,
    };
    frame.events.push({
      kind: 'folderSpawned',
      folderId: folder.id,
      storyId: folder.storyId,
      fixtureId: free.id,
    });
  }
  return next;
}

/** Pick up / put down for every player who pressed interact, in join order (first wins). */
function interact(state: GameState, frame: SimFrame): GameState {
  let next = state;
  for (const player of Object.values(state.players)) {
    if (!frame.intents[player.id]?.interact) {
      continue;
    }
    const carried = carriedFolder(next, player.id);
    next = carried ? putDown(next, frame, player, carried) : pickUp(next, frame, player);
  }
  return next;
}

function putDown(
  state: GameState,
  frame: SimFrame,
  player: PlayerState,
  folder: Folder,
): GameState {
  const { map } = frame.ctx;
  const target = findInteractionTarget(map, player, player.facing);
  let location: FolderLocation;
  if (target && canPutOn(state, target)) {
    location = { kind: 'fixture', fixtureId: target.id };
  } else if (target && isInFront(target, player)) {
    // Facing a fixture that cannot take the folder: keep holding it rather than dropping it.
    return state;
  } else {
    // Nothing in front; a refusing fixture merely within reach (beside or behind) does not
    // stop the player from dropping the folder on the floor ahead.
    const at = floorDropPoint(map, player);
    location = { kind: 'floor', x: at.x, y: at.y };
  }
  frame.events.push({ kind: 'folderPutDown', folderId: folder.id, playerId: player.id, location });
  return { ...state, folders: { ...state.folders, [folder.id]: { ...folder, location } } };
}

/**
 * Preference: the fixture in front, then the nearest floor folder, then a fixture that is only
 * within reach (beside or behind), so what the player faces wins.
 */
function pickUp(state: GameState, frame: SimFrame, player: PlayerState): GameState {
  const target = findInteractionTarget(frame.ctx.map, player, player.facing);
  const onTarget =
    target && !isOperated(state, target) ? folderOnFixture(state, target.id) : undefined;
  const folder =
    target && isInFront(target, player)
      ? (onTarget ?? nearestFloorFolder(state, player))
      : (nearestFloorFolder(state, player) ?? onTarget);
  if (!folder) {
    return state;
  }
  frame.events.push({ kind: 'folderPickedUp', folderId: folder.id, playerId: player.id });
  return {
    ...state,
    folders: {
      ...state.folders,
      [folder.id]: { ...folder, location: { kind: 'carried', playerId: player.id } },
    },
  };
}

function isInFront(fixture: Fixture, player: PlayerState): boolean {
  const front = frontTile(player, player.facing);
  return fixture.col === front.col && fixture.row === front.row;
}

/** Tables, stations and desks take a folder when empty; the conveyor only delivers. */
function canPutOn(state: GameState, fixture: Fixture): boolean {
  if (fixture.kind === 'conveyor' || isOperated(state, fixture)) {
    return false;
  }
  return !folderOnFixture(state, fixture.id);
}

/** A station or desk someone is working at is off limits for both putting and taking. */
function isOperated(state: GameState, fixture: Fixture): boolean {
  if (fixture.kind === 'station') {
    return Boolean(state.stations[fixture.id]?.operatorId);
  }
  if (fixture.kind === 'desk') {
    return Boolean(state.desks[fixture.id]?.operatorId);
  }
  return false;
}

/** Just in front of the player when that point is on floor, otherwise where the player stands. */
function floorDropPoint(map: TileMap, player: PlayerState): Vec2 {
  const x = quantize(player.x + Math.cos(player.facing) * FLOOR_DROP_DISTANCE_TILES);
  const y = quantize(player.y + Math.sin(player.facing) * FLOOR_DROP_DISTANCE_TILES);
  if (!isSolid(map, Math.floor(x), Math.floor(y))) {
    return { x, y };
  }
  return { x: player.x, y: player.y };
}

function nearestFloorFolder(state: GameState, player: PlayerState): Folder | undefined {
  let best: Folder | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const folder of Object.values(state.folders)) {
    if (folder.location.kind !== 'floor') {
      continue;
    }
    const distance = Math.hypot(folder.location.x - player.x, folder.location.y - player.y);
    if (distance <= INTERACTION_REACH_TILES && distance < bestDistance) {
      best = folder;
      bestDistance = distance;
    }
  }
  return best;
}
