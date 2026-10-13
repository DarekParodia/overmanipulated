// Pure placement rules for world entities (fixtures, folders, station indicators). Kept free of
// three.js and React so they can be unit-tested; components turn these numbers into meshes.
import { getStory } from '@redakcja/content';
import {
  type Fixture,
  type Folder,
  MINIGAME_FAIL_LOCKOUT_MS,
  type NextFolder,
  type Priority,
  type Station,
  type StoryType,
} from '@redakcja/shared';
import { outageFraction, outageSeconds } from '../events/event-model.ts';
import { clamp01 } from '../fx/animation/easing.ts';

/** Height of the surface a folder lies on, per fixture kind (world units, floor = 0). */
export const SURFACE_HEIGHT = {
  conveyor: 0.5,
  table: 0.72,
  desk: 0.76,
  imageSearch: 0.8,
  archive: 1.05,
  sourceRegistry: 0.7,
  phone: 0.76,
  aiScanner: 0.76,
  dataLibrary: 0.76,
} as const;

export function surfaceHeight(fixture: Fixture): number {
  if (fixture.kind === 'station') {
    return SURFACE_HEIGHT[fixture.station ?? 'phone'];
  }
  return SURFACE_HEIGHT[fixture.kind];
}

/** Folder held in front of the carrier: distance from the body centre and height. */
export const CARRY_REACH = 0.6;
export const CARRY_HEIGHT = 0.82;
/** Folder box size: width (x), thickness (y), depth (z). */
export const FOLDER_SIZE = { width: 0.6, thickness: 0.06, depth: 0.45 } as const;

export type Placement = {
  x: number;
  /** Height above the floor (world y). */
  height: number;
  /** Sim y (world z). */
  y: number;
  /** Rotation about the vertical axis in radians (world). */
  yaw: number;
  /** Forward tilt of a carried folder. */
  pitch: number;
};

export type CarrierPose = { x: number; y: number; facing: number };

/** Small, stable per-folder yaw so folders lying around don't line up perfectly. */
export function restingYaw(folderId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < folderId.length; i++) {
    hash = Math.imul(hash ^ folderId.charCodeAt(i), 16777619);
  }
  const unit = ((hash >>> 0) % 1000) / 999;
  return (unit - 0.5) * 0.32;
}

/**
 * Where a folder should be drawn, or null when it can't be placed (unknown fixture, carrier not
 * rendered). Carried folders keep their cover facing the camera so the type icon stays readable.
 */
export function folderPlacement(
  folder: Folder,
  fixtures: ReadonlyMap<string, Fixture>,
  carrier: (playerId: string) => CarrierPose | undefined,
): Placement | null {
  const location = folder.location;
  switch (location.kind) {
    case 'carried': {
      const pose = carrier(location.playerId);
      if (!pose) {
        return null;
      }
      return {
        x: pose.x + Math.cos(pose.facing) * CARRY_REACH,
        y: pose.y + Math.sin(pose.facing) * CARRY_REACH,
        height: CARRY_HEIGHT,
        yaw: 0,
        pitch: 0.18,
      };
    }
    case 'fixture': {
      const fixture = fixtures.get(location.fixtureId);
      if (!fixture) {
        return null;
      }
      return {
        x: fixture.col + 0.5,
        y: fixture.row + 0.5,
        height: surfaceHeight(fixture) + FOLDER_SIZE.thickness / 2,
        yaw: restingYaw(folder.id),
        pitch: 0,
      };
    }
    case 'floor':
      return {
        x: location.x,
        y: location.y,
        height: FOLDER_SIZE.thickness / 2 + 0.005,
        yaw: restingYaw(folder.id) * 2,
        pitch: 0,
      };
  }
}

export type FolderLook = { type: StoryType; priority: Priority };

/** Type and priority come from the story; unknown stories fall back to a plain article. */
export function folderLook(storyId: string): FolderLook {
  const story = getStory(storyId);
  return story
    ? { type: story.type, priority: story.priority }
    : { type: 'article', priority: 'normal' };
}

export const ATLAS_TYPES: readonly StoryType[] = [
  'photo',
  'quote',
  'post',
  'recording',
  'statistic',
  'article',
];
export const ATLAS_PRIORITIES: readonly Priority[] = ['normal', 'important', 'urgent'];

/** Cell of the folder cover atlas: column = type, row = priority (row 0 at the canvas top). */
export function atlasCell(look: FolderLook): { col: number; row: number } {
  return {
    col: Math.max(0, ATLAS_TYPES.indexOf(look.type)),
    row: Math.max(0, ATLAS_PRIORITIES.indexOf(look.priority)),
  };
}

/** Stamp marks drawn on a folder cover; more than this still shows as this many. */
export const MAX_STAMP_MARKS = 5;

export function stampMarkCount(folder: Folder): number {
  return Math.min(folder.stamps.length, MAX_STAMP_MARKS);
}

/**
 * Lockout time left as a fraction of the whole lockout; without an announced total (e.g. after a
 * reconnect) the Normal lockout stands in, never less than what is left.
 */
export function lockoutFraction(lockoutMs: number, totalMs: number | undefined): number {
  const total = Math.max(totalMs ?? MINIGAME_FAIL_LOCKOUT_MS, lockoutMs, 1);
  return clamp01(lockoutMs / total);
}

export type StationIndicator =
  | { kind: 'none' }
  | { kind: 'working'; fraction: number; operatorId: string | null }
  | { kind: 'busy'; operatorId: string | null }
  | { kind: 'lockout'; fraction: number }
  /** The station is down (outage event): time left as a fraction of the announced duration. */
  | { kind: 'down'; fraction: number; seconds: number }
  /** Conveyor: the next scheduled folder, the ring filling up as it nears (S7-09). */
  | { kind: 'incoming'; fraction: number; seconds: number }
  /** Conveyor: a due folder waits because every conveyor tile holds one. */
  | { kind: 'full' };

/**
 * What to show above a station: a work dial, a "busy" tag, the lockout countdown, or the
 * outage countdown (`outageTotalMs`: the duration the outage announced, if known;
 * `lockoutTotalMs`: the lockout the last `minigameFailed` announced, which the difficulty scales).
 */
export function stationIndicator(
  station: Station | undefined,
  outageTotalMs?: number,
  lockoutTotalMs?: number,
): StationIndicator {
  if (!station) {
    return { kind: 'none' };
  }
  if (station.outageMs > 0) {
    return {
      kind: 'down',
      fraction: outageFraction(station.outageMs, outageTotalMs),
      seconds: outageSeconds(station.outageMs),
    };
  }
  switch (station.phase) {
    case 'idle':
      return { kind: 'none' };
    case 'working':
      return {
        kind: 'working',
        fraction: station.durationMs > 0 ? clamp01(station.progressMs / station.durationMs) : 0,
        operatorId: station.operatorId,
      };
    case 'minigame':
      return { kind: 'busy', operatorId: station.operatorId };
    case 'lockout':
      return { kind: 'lockout', fraction: lockoutFraction(station.lockoutMs, lockoutTotalMs) };
  }
}

/**
 * What the conveyor sign shows: `full` while a due folder waits for a free tile, otherwise the
 * next scheduled folder as a ring that fills from the previous scheduled time (`sinceMs`) to its
 * due time, with the whole seconds left; nothing once the schedule is used up. `sinceMs` is a
 * due time, not an arrival, so after a held spawn the ring may start part-filled; two entries
 * due at the same moment count as a full ring.
 */
export function conveyorIndicator(
  next: NextFolder | null,
  elapsedMs: number,
  full: boolean,
): StationIndicator {
  if (full) {
    return { kind: 'full' };
  }
  if (!next) {
    return { kind: 'none' };
  }
  const span = next.atMs - next.sinceMs;
  return {
    kind: 'incoming',
    fraction: span > 0 ? clamp01((elapsedMs - next.sinceMs) / span) : 1,
    seconds: Math.max(0, Math.ceil((next.atMs - elapsedMs) / 1000)),
  };
}

/**
 * True when neither the left nor the upper neighbour is a desk: the lamp goes on the first tile
 * of a desk run, horizontal or vertical.
 */
export function isFirstDeskTile(fixture: Fixture, fixtures: readonly Fixture[]): boolean {
  return (
    fixture.kind === 'desk' &&
    !fixtures.some(
      (f) =>
        f.kind === 'desk' &&
        ((f.row === fixture.row && f.col === fixture.col - 1) ||
          (f.col === fixture.col && f.row === fixture.row - 1)),
    )
  );
}
