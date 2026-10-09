import { describe, expect, it } from 'bun:test';
import { STORIES } from '@redakcja/content';
import { type Folder, GREYBOX_MAP, MINIGAME_FAIL_LOCKOUT_MS, type Station } from '@redakcja/shared';
import {
  ATLAS_PRIORITIES,
  ATLAS_TYPES,
  atlasCell,
  CARRY_HEIGHT,
  CARRY_REACH,
  FOLDER_SIZE,
  folderLook,
  folderPlacement,
  isFirstDeskTile,
  MAX_STAMP_MARKS,
  restingYaw,
  SURFACE_HEIGHT,
  stampMarkCount,
  stationIndicator,
  surfaceHeight,
} from './entities.ts';

const fixtures = new Map(GREYBOX_MAP.fixtures.map((f) => [f.id, f]));

function folder(location: Folder['location'], stamps: string[] = []): Folder {
  return {
    id: 'f1',
    storyId: STORIES[0]?.id ?? 'missing',
    location,
    stamps,
    spawnedAtMs: 0,
    deadlineMs: 60_000,
    warned: false,
  };
}

function station(patch: Partial<Station>): Station {
  return {
    id: 'imageSearch-0',
    kind: 'imageSearch',
    operatorId: null,
    phase: 'idle',
    progressMs: 0,
    durationMs: 4000,
    minigameSeed: 1,
    lockoutMs: 0,
    outageMs: 0,
    ...patch,
  };
}

describe('folder placement', () => {
  it('puts a folder on its fixture top surface at the tile centre', () => {
    const p = folderPlacement(
      folder({ kind: 'fixture', fixtureId: 'archive-0' }),
      fixtures,
      () => undefined,
    );
    const archive = fixtures.get('archive-0');
    expect(archive).toBeDefined();
    expect(p?.x).toBe((archive?.col ?? 0) + 0.5);
    expect(p?.y).toBe((archive?.row ?? 0) + 0.5);
    expect(p?.height).toBeCloseTo(SURFACE_HEIGHT.archive + FOLDER_SIZE.thickness / 2);
  });

  it('lays a floor folder at its coordinates, just above the floor', () => {
    const p = folderPlacement(folder({ kind: 'floor', x: 3.2, y: 6.7 }), fixtures, () => undefined);
    expect(p).toMatchObject({ x: 3.2, y: 6.7 });
    expect(p?.height).toBeGreaterThan(0);
    expect(p?.height).toBeLessThan(0.1);
  });

  it('holds a carried folder in front of the carrier at chest height', () => {
    const p = folderPlacement(folder({ kind: 'carried', playerId: 'p1' }), fixtures, (id) =>
      id === 'p1' ? { x: 5, y: 5, facing: Math.PI / 2 } : undefined,
    );
    expect(p?.x).toBeCloseTo(5);
    expect(p?.y).toBeCloseTo(5 + CARRY_REACH);
    expect(p?.height).toBe(CARRY_HEIGHT);
    expect(p?.yaw).toBe(0);
  });

  it('hides folders it cannot place', () => {
    expect(
      folderPlacement(folder({ kind: 'carried', playerId: 'gone' }), fixtures, () => undefined),
    ).toBeNull();
    expect(
      folderPlacement(folder({ kind: 'fixture', fixtureId: 'nope-9' }), fixtures, () => undefined),
    ).toBeNull();
  });

  it('gives each folder a small stable resting yaw', () => {
    expect(restingYaw('f1')).toBe(restingYaw('f1'));
    for (const id of ['a', 'f1', 'folder-12', 'zzz']) {
      expect(Math.abs(restingYaw(id))).toBeLessThanOrEqual(0.16);
    }
  });

  it('knows a surface height for every fixture in the greybox map', () => {
    for (const fixture of GREYBOX_MAP.fixtures) {
      expect(surfaceHeight(fixture)).toBeGreaterThan(0.3);
    }
  });
});

describe('folder look', () => {
  it('maps every story to a distinct atlas cell for its type and priority', () => {
    for (const story of STORIES) {
      const look = folderLook(story.id);
      expect(look).toEqual({ type: story.type, priority: story.priority });
      const cell = atlasCell(look);
      expect(ATLAS_TYPES[cell.col]).toBe(story.type);
      expect(ATLAS_PRIORITIES[cell.row]).toBe(story.priority);
    }
  });

  it('falls back to a plain article for unknown stories', () => {
    expect(folderLook('no-such-story')).toEqual({ type: 'article', priority: 'normal' });
  });

  it('caps stamp marks', () => {
    expect(stampMarkCount(folder({ kind: 'floor', x: 1, y: 1 }, ['a', 'b']))).toBe(2);
    const many = Array.from({ length: 9 }, (_, i) => `s${i}`);
    expect(stampMarkCount(folder({ kind: 'floor', x: 1, y: 1 }, many))).toBe(MAX_STAMP_MARKS);
  });
});

describe('station indicator', () => {
  it('is hidden for idle or unknown stations', () => {
    expect(stationIndicator(undefined)).toEqual({ kind: 'none' });
    expect(stationIndicator(station({}))).toEqual({ kind: 'none' });
  });

  it('shows work progress as a fraction', () => {
    expect(
      stationIndicator(station({ phase: 'working', operatorId: 'p1', progressMs: 1000 })),
    ).toEqual({ kind: 'working', fraction: 0.25, operatorId: 'p1' });
    expect(
      stationIndicator(station({ phase: 'working', progressMs: 9000, durationMs: 4000 })),
    ).toMatchObject({ fraction: 1 });
    expect(stationIndicator(station({ phase: 'working', durationMs: 0 }))).toMatchObject({
      fraction: 0,
    });
  });

  it('marks a running minigame as busy and drains lockout', () => {
    expect(stationIndicator(station({ phase: 'minigame', operatorId: 'p2' }))).toEqual({
      kind: 'busy',
      operatorId: 'p2',
    });
    expect(
      stationIndicator(station({ phase: 'lockout', lockoutMs: MINIGAME_FAIL_LOCKOUT_MS / 2 })),
    ).toEqual({ kind: 'lockout', fraction: 0.5 });
  });
});

describe('editorial desk lamp', () => {
  it('goes on the first tile of each desk run only', () => {
    const desks = GREYBOX_MAP.fixtures.filter((f) => f.kind === 'desk');
    expect(desks.length).toBeGreaterThan(1);
    const first = desks.filter((f) => isFirstDeskTile(f, GREYBOX_MAP.fixtures));
    expect(first.map((f) => f.id)).toEqual(['desk-0']);
  });
});
