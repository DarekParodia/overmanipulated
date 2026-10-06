import { describe, expect, it } from 'bun:test';
import { PLAYER_HALF_SIZE, TICK_MS } from '../constants.ts';
import { GREYBOX_MAP, isSolid, parseLayout } from './map.ts';
import { moveBody, normalizeMove } from './movement.ts';
import { createRng, nextRandom } from './rng.ts';
import { addPlayer, createGameState, removePlayer } from './state.ts';
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
  const twoPlayers = addPlayer(
    addPlayer(createGameState(), 'a', ROOM.spawns[0] ?? { x: 0, y: 0 }),
    'b',
    {
      x: 2.5,
      y: 2.5,
    },
  );

  it('applies queued inputs in order and records the last sequence', () => {
    const next = step(twoPlayers, { a: [input(1, 1, 0), input(2, 1, 0)] }, TICK_MS, ROOM);
    expect(next.tick).toBe(1);
    expect(next.players.a?.lastInputSeq).toBe(2);
    expect(next.players.a?.x).toBeGreaterThan(2.5);
    expect(next.players.a?.moving).toBe(true);
  });

  it('leaves players without input in place and marks them idle', () => {
    const next = step(twoPlayers, {}, TICK_MS, ROOM);
    expect(next.players.b).toMatchObject({ x: 2.5, y: 2.5, moving: false, lastInputSeq: -1 });
  });

  it('lets players pass through each other', () => {
    // Both start on the same tile; movement is never blocked by another player.
    const next = step(twoPlayers, { a: [input(1, 0, -1)], b: [input(1, 0, 1)] }, TICK_MS, ROOM);
    expect(next.players.a?.y).toBeLessThan(2.5);
    expect(next.players.b?.y).toBeGreaterThan(2.5);
  });

  it('faces the direction of movement and keeps facing when idle', () => {
    const moved = step(twoPlayers, { a: [input(1, -1, 0)] }, TICK_MS, ROOM);
    expect(moved.players.a?.facing).toBeCloseTo(Math.PI, 10);
    const idleNext = step(moved, { a: [input(2, 0, 0)] }, TICK_MS, ROOM);
    expect(idleNext.players.a?.facing).toBeCloseTo(Math.PI, 10);
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
