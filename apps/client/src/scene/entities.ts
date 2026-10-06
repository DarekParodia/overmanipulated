// Pure placement rules for world entities (fixtures, folders, station indicators). Kept free of
// three.js and React so they can be unit-tested; components turn these numbers into meshes.
import { getStory } from '@redakcja/content';
import {
  type Fixture,
  type Folder,
  MINIGAME_FAIL_LOCKOUT_MS,
  type Priority,
  type Station,
  type StoryType,
} from '@redakcja/shared';
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

export type StationIndicator =
  | { kind: 'none' }
  | { kind: 'working'; fraction: number; operatorId: string | null }
  | { kind: 'busy'; operatorId: string | null }
  | { kind: 'lockout'; fraction: number };

/** What to show above a station: a work dial, a "busy" tag, or the lockout countdown. */
export function stationIndicator(station: Station | undefined): StationIndicator {
  if (!station) {
    return { kind: 'none' };
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
      return { kind: 'lockout', fraction: clamp01(station.lockoutMs / MINIGAME_FAIL_LOCKOUT_MS) };
  }
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
