import { describe, expect, it } from 'bun:test';
import { PLAYER_HALF_SIZE, TICK_MS } from '../constants.ts';
import { testCommand, testContext } from './__fixtures__/greybox.ts';
import { findInteractionTarget, GREYBOX_MAP, isSolid, parseLayout } from './map.ts';
import { moveBody, normalizeMove } from './movement.ts';
import { createRng, nextRandom } from './rng.ts';
import { addPlayer, carriedFolder, createGameState, removePlayer } from './state.ts';
import { type PlayerInput, step } from './step.ts';

const ROOM = parseLayout(['#####', '#...#', '#.1.#', '#...#', '#####']);
const idle = { interact: false, work: false };
const input = (seq: number, x: number, y: number): PlayerInput => ({
  seq,
  move: { x, y },
  actions: idle,
});

describe('parseLayout', () => {
  it('reads tiles and spawn points', () => {
    expect(ROOM.width).toBe(5);
    expect(ROOM.spawns).toEqual([{ x: 2.5, y: 2.5 }]);
    expect(isSolid(ROOM, 0, 0)).toBe(true);
    expect(isSolid(ROOM, 2, 2)).toBe(false);
  });

  it('treats everything outside the map as solid', () => {
    expect(isSolid(ROOM, -1, 2)).toBe(true);
    expect(isSolid(ROOM, 2, 99)).toBe(true);
  });

  it('rejects ragged rows, unknown characters and missing spawn slots', () => {
    expect(() => parseLayout(['###', '##'])).toThrow();
    expect(() => parseLayout(['#?#'])).toThrow();
    expect(() => parseLayout(['#2#'])).toThrow();
  });

  it('has four spawn points on floor in the greybox newsroom', () => {
    expect(GREYBOX_MAP.spawns).toHaveLength(4);
    for (const spawn of GREYBOX_MAP.spawns) {
      expect(isSolid(GREYBOX_MAP, Math.floor(spawn.x), Math.floor(spawn.y))).toBe(false);
    }
  });
});

describe('movement', () => {
  it('moves 4.5 tiles per second', () => {
    const open = parseLayout(['.........', '.........', '.........', '.........']);
    const body = moveBody({ x: 2.5, y: 2.5 }, { x: 1, y: 0 }, 100, open);
    expect(body.x).toBeCloseTo(2.95, 3);
    expect(body.y).toBe(2.5);
  });

  it('normalises diagonal input to length 1', () => {
    const dir = normalizeMove({ x: 1, y: 1 });
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 10);
  });

  it('clamps out-of-range and non-finite input', () => {
    expect(normalizeMove({ x: 5, y: Number.NaN })).toEqual({ x: 1, y: 0 });
  });

  it('stops at a wall', () => {
    let body = { x: 2.5, y: 2.5 };
    for (let i = 0; i < 40; i++) {
      body = moveBody(body, { x: 1, y: 0 }, TICK_MS, ROOM);
    }
    expect(body.x).toBeCloseTo(4 - PLAYER_HALF_SIZE, 2);
    expect(body.x + PLAYER_HALF_SIZE).toBeLessThanOrEqual(4);
  });

  it('never ends up overlapping a wall while circling the room', () => {
    let body = { x: 2.5, y: 2.5 };
    for (let i = 0; i < 400; i++) {
      body = moveBody(body, { x: Math.cos(i / 7), y: Math.sin(i / 5) }, TICK_MS, ROOM);
      expect(body.x - PLAYER_HALF_SIZE).toBeGreaterThanOrEqual(1);
      expect(body.x + PLAYER_HALF_SIZE).toBeLessThanOrEqual(4);
      expect(body.y - PLAYER_HALF_SIZE).toBeGreaterThanOrEqual(1);
      expect(body.y + PLAYER_HALF_SIZE).toBeLessThanOrEqual(4);
    }
  });

  it('slides along a wall when moving diagonally into it', () => {
    let body = { x: 2.5, y: 2.5 };
    for (let i = 0; i < 40; i++) {
      body = moveBody(body, { x: 1, y: 1 }, TICK_MS, ROOM);
    }
    expect(body.x).toBeCloseTo(4 - PLAYER_HALF_SIZE, 2);
    expect(body.y).toBeCloseTo(4 - PLAYER_HALF_SIZE, 2);
  });

  it('is deterministic', () => {
    const run = () => {
      let body = { x: 2.5, y: 2.5 };
      for (let i = 0; i < 100; i++) {
        body = moveBody(body, { x: Math.sin(i), y: Math.cos(i) }, TICK_MS, ROOM);
      }
      return body;
    };
    expect(run()).toEqual(run());
  });
});

describe('step', () => {
  const ctx = testContext({ map: ROOM });
  const twoPlayers = addPlayer(
    addPlayer(createGameState(), 'a', ROOM.spawns[0] ?? { x: 0, y: 0 }),
    'b',
    {
      x: 2.5,
      y: 2.5,
    },
  );

  it('applies queued inputs in order and records the last sequence', () => {
    const next = step(twoPlayers, { a: [input(1, 1, 0), input(2, 1, 0)] }, [], ctx).state;
    expect(next.tick).toBe(1);
    expect(next.players.a?.lastInputSeq).toBe(2);
    expect(next.players.a?.x).toBeGreaterThan(2.5);
    expect(next.players.a?.moving).toBe(true);
  });

  it('leaves players without input in place and marks them idle', () => {
    const next = step(twoPlayers, {}, [], ctx).state;
    expect(next.players.b).toMatchObject({ x: 2.5, y: 2.5, moving: false, lastInputSeq: -1 });
  });

  it('lets players pass through each other', () => {
    // Both start on the same tile; movement is never blocked by another player.
    const next = step(twoPlayers, { a: [input(1, 0, -1)], b: [input(1, 0, 1)] }, [], ctx).state;
    expect(next.players.a?.y).toBeLessThan(2.5);
    expect(next.players.b?.y).toBeGreaterThan(2.5);
  });

  it('faces the direction of movement and keeps facing when idle', () => {
    const moved = step(twoPlayers, { a: [input(1, -1, 0)] }, [], ctx).state;
    expect(moved.players.a?.facing).toBeCloseTo(Math.PI, 10);
    const idleNext = step(moved, { a: [input(2, 0, 0)] }, [], ctx).state;
    expect(idleNext.players.a?.facing).toBeCloseTo(Math.PI, 10);
  });

  it('advances level time and keeps work held between inputs', () => {
    const held = step(
      twoPlayers,
      { a: [{ ...input(1, 0, 0), actions: { interact: false, work: true } }] },
      [],
      ctx,
    ).state;
    expect(held.elapsedMs).toBe(TICK_MS);
    expect(held.crew.a?.workHeld).toBe(true);
    // No input arrived this tick: the button is still considered held.
    expect(step(held, {}, [], ctx).state.crew.a?.workHeld).toBe(true);
  });

  it('turns ping commands into events, with a cooldown', () => {
    const ping = testCommand('a', { kind: 'ping', ping: 'fake' });
    const first = step(twoPlayers, {}, [ping], ctx);
    expect(first.events).toEqual([{ kind: 'ping', playerId: 'a', ping: 'fake' }]);
    expect(step(first.state, {}, [ping], ctx).events).toEqual([]);
  });

  it('does not change an ended level', () => {
    const ended = { ...twoPlayers, ended: { won: true, stars: 1 } };
    expect(step(ended, { a: [input(1, 1, 0)] }, [], ctx).state).toBe(ended);
  });

  it('removes players', () => {
    expect(Object.keys(removePlayer(twoPlayers, 'a').players)).toEqual(['b']);
  });
});

describe('rng', () => {
  it('is reproducible for a seed and in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      const value = a.next();
      expect(value).toBe(b.next());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('advances state', () => {
    const [, next] = nextRandom(1);
    expect(next).not.toBe(1);
  });
});

describe('fixtures and interaction targets', () => {
  it('reads fixtures from the layout with stable ids', () => {
    const map = parseLayout(['#####', '#CIT#', '#.1.#', '#####']);
    expect(map.fixtures).toEqual([
      { id: 'conveyor-0', kind: 'conveyor', col: 1, row: 1 },
      { id: 'imageSearch-0', kind: 'station', station: 'imageSearch', col: 2, row: 1 },
      { id: 'table-0', kind: 'table', col: 3, row: 1 },
    ]);
    expect(isSolid(map, 2, 1)).toBe(true);
  });

  it('prefers the fixture in front, then the nearest one in reach', () => {
    const map = parseLayout(['#####', '#CIT#', '#.1.#', '#####']);
    const below = { x: 2.5, y: 2.5 };
    expect(findInteractionTarget(map, below, -Math.PI / 2)?.id).toBe('imageSearch-0');
    // Facing away (down, into the wall): nearest fixture within reach is the station above.
    expect(findInteractionTarget(map, below, Math.PI / 2)?.id).toBe('imageSearch-0');
    expect(findInteractionTarget(map, { x: 1.5, y: 2.5 }, Math.PI)?.id).toBe('conveyor-0');
  });

  it('has stations, desks and a conveyor in the greybox newsroom', () => {
    const kinds = new Set<string>(GREYBOX_MAP.fixtures.map((f) => f.station ?? f.kind));
    for (const kind of ['conveyor', 'desk', 'table', 'imageSearch', 'archive', 'sourceRegistry']) {
      expect(kinds.has(kind)).toBe(true);
    }
    const state = createGameState({ map: GREYBOX_MAP });
    expect(Object.keys(state.stations)).toEqual(['imageSearch-0', 'archive-0', 'sourceRegistry-0']);
    expect(Object.keys(state.desks)).toEqual(['desk-0', 'desk-1']);
  });

  it('drops a carried folder and frees stations when a player is removed', () => {
    let state = addPlayer(createGameState({ map: GREYBOX_MAP }), 'a', { x: 5, y: 3 });
    state = {
      ...state,
      folders: {
        f1: {
          id: 'f1',
          storyId: 's',
          location: { kind: 'carried', playerId: 'a' },
          stamps: [],
          spawnedAtMs: 0,
          deadlineMs: 1000,
          warned: false,
        },
      },
      desks: { 'desk-0': { id: 'desk-0', operatorId: 'a' } },
    };
    const removed = removePlayer(state, 'a');
    expect(removed.folders.f1?.location).toEqual({ kind: 'floor', x: 5, y: 3 });
    expect(removed.desks['desk-0']?.operatorId).toBeNull();
    expect(carriedFolder(removed, 'a')).toBeUndefined();
  });
});
