import { describe, expect, it } from 'bun:test';
import { abilityPreview, type CrewSnapshot, type Folder, GREYBOX_MAP } from '@redakcja/shared';
import { buildAbilityEnv, buildAbilityView } from './ability-view.ts';

const member = (id: string, extra: Partial<CrewSnapshot> = {}): CrewSnapshot => ({
  id,
  abilityReadyAtMs: 0,
  abilityArmed: false,
  fieldCall: null,
  rescuesLeft: 0,
  ...extra,
});

/** p1 carries f1. */
const carried: Folder = {
  id: 'f1',
  spawnKey: 's0',
  storyId: 'story-a',
  location: { kind: 'carried', playerId: 'p1' },
  stamps: [],
  spawnedAtMs: 0,
  deadlineMs: 50_000,
  warned: false,
};

const onConveyor: Folder = {
  ...carried,
  id: 'f2',
  spawnKey: 's1',
  location: { kind: 'fixture', fixtureId: 'conveyor-0' },
  deadlineMs: 30_000,
};

const roomPlayers = [
  { id: 'p1', role: 'managingEditor' as const, connected: true },
  { id: 'p2', role: null, connected: true },
  { id: 'p3', role: 'reporter' as const, connected: false },
];

describe('ability view from snapshot state (S7-40)', () => {
  const view = buildAbilityView({
    elapsedMs: 12_000,
    folders: [carried, onConveyor],
    stations: [],
    desks: [],
    crew: [member('p1'), member('p2'), member('p3', { abilityReadyAtMs: 70_000 })],
    roomPlayers,
    players: [
      { id: 'p1', x: 2, y: 2, facing: 0 },
      { id: 'p2', x: 4, y: 2, facing: 0 },
      { id: 'p3', x: 3, y: 2, facing: 0 },
    ],
    local: { id: 'p1', x: 5.5, y: 3.5, facing: Math.PI },
  });

  it('keys everything by id, takes roles from the room and the local predicted position', () => {
    expect(view.elapsedMs).toBe(12_000);
    expect(Object.keys(view.players)).toEqual(['p1', 'p2', 'p3']);
    expect(view.players.p1).toEqual({ x: 5.5, y: 3.5, facing: Math.PI });
    expect(view.players.p2).toEqual({ x: 4, y: 2, facing: 0 });
    expect(view.crew.p1?.role).toBe('managingEditor');
    expect(view.crew.p2?.role).toBeNull();
    expect(view.crew.p3).toMatchObject({ role: 'reporter', abilityReadyAtMs: 70_000 });
    expect(Object.keys(view.folders)).toEqual(['f1', 'f2']);
  });

  it('feeds the shared preview: Przedłużenie targets the carried folder before the urgent one', () => {
    const env = buildAbilityEnv(GREYBOX_MAP, () => undefined, roomPlayers);
    expect(abilityPreview(view, 'p1', env)).toEqual({ kind: 'now', folderId: 'f1' });
    expect(abilityPreview(view, 'p2', env)).toEqual({ kind: 'none' });
    expect(abilityPreview(view, 'p3', env)).toEqual({ kind: 'cooling', readyAtMs: 70_000 });
  });

  it('marks disconnected players absent and passes story stamps through', () => {
    const env = buildAbilityEnv(
      GREYBOX_MAP,
      (id) => (id === 'story-a' ? { stamps: [{ id: 'a-phone', station: 'phone' }] } : undefined),
      roomPlayers,
    );
    expect([...(env.absent ?? [])]).toEqual(['p3']);
    expect(env.story('story-a')).toEqual({ stamps: [{ id: 'a-phone', station: 'phone' }] });
    expect(env.story('missing')).toBeUndefined();
  });

  it('adds the local player when the snapshot does not list them yet', () => {
    const early = buildAbilityView({
      elapsedMs: 0,
      folders: [],
      stations: [],
      desks: [],
      crew: [],
      roomPlayers,
      players: [],
      local: { id: 'p1', x: 1, y: 1, facing: 0 },
    });
    expect(early.players).toEqual({ p1: { x: 1, y: 1, facing: 0 } });
  });
});
