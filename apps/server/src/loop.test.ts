import { describe, expect, it } from 'bun:test';
import { TICK_MS } from '@redakcja/shared';
import { createGameLoop } from './loop.ts';
import type { RoomRegistry } from './rooms/registry.ts';

function setup() {
  const state = { time: 0, ticks: 0, rooms: 1 };
  const registry = {
    tick: () => {
      state.ticks++;
    },
    get roomCount() {
      return state.rooms;
    },
  } as unknown as RoomRegistry;
  const loop = createGameLoop(registry, () => state.time);
  return { state, loop };
}

describe('game loop', () => {
  it('runs one tick per 50 ms of elapsed time, carrying remainders', () => {
    const { state, loop } = setup();
    loop.start();
    state.time += TICK_MS * 1.5;
    loop.pump();
    expect(state.ticks).toBe(1);
    state.time += TICK_MS * 0.5;
    loop.pump();
    expect(state.ticks).toBe(2);
    loop.stop();
  });

  it('caps catch-up after a long pause instead of fast-forwarding', () => {
    const { state, loop } = setup();
    loop.start();
    state.time += TICK_MS * 100;
    loop.pump();
    expect(state.ticks).toBe(5);
    state.time += TICK_MS;
    loop.pump();
    expect(state.ticks).toBe(6);
    loop.stop();
  });

  it('stops itself when there are no rooms', () => {
    const { state, loop } = setup();
    loop.start();
    expect(loop.running).toBe(true);
    state.rooms = 0;
    state.time += TICK_MS;
    loop.pump();
    expect(loop.running).toBe(false);
  });
});
