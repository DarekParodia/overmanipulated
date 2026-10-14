import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_BENCH,
  formatBench,
  runServerTickBench,
  scriptedInput,
  TICK_TARGET_MS,
} from './server-tick.ts';

describe('server tick bench (S7-92)', () => {
  it('defaults to 150 versus rooms of 4 + 4, with 8 spectators in 50 of them, over 200 ticks', () => {
    expect(DEFAULT_BENCH).toEqual({
      mode: 'versus',
      rooms: 150,
      spectatedRooms: 50,
      playersPerTeam: 4,
      spectatorsPerRoom: 8,
      levelId: 'l1-burza',
      warmupTicks: 20,
      ticks: 200,
      seed: 92,
    });
  });

  it('holds the mean tick to 25 ms, half the 50 ms server tick', () => {
    expect(TICK_TARGET_MS).toBe(25);
  });

  it('scripts each player: a compass direction per second, interact every 2 s, work half the time', () => {
    expect(scriptedInput(0, 0)).toEqual({
      type: 'input',
      seq: 0,
      move: { x: 1, y: 0 },
      actions: { interact: true, work: true },
    });
    expect(scriptedInput(2, 10)).toEqual({
      type: 'input',
      seq: 10,
      move: { x: 0, y: 1 },
      actions: { interact: false, work: false },
    });
    // Slot 1 presses interact 5 ticks before slot 0's next press; a second later it turns.
    expect(scriptedInput(1, 35).actions.interact).toBe(true);
    expect(scriptedInput(1, 20).move).toEqual({ x: 0, y: 1 });
  });

  it('plays every room and counts what players and spectators receive', () => {
    const result = runServerTickBench({ rooms: 3, spectatedRooms: 1, warmupTicks: 2, ticks: 10 });
    expect(result.rooms).toBe(3);
    expect(result.players).toBe(24);
    expect(result.spectators).toBe(8);
    expect(result.playing).toBe(3);
    expect(result.ticks).toBe(10);
    expect(result.tickMs.mean).toBeGreaterThan(0);
    expect(result.tickMs.p95).toBeLessThanOrEqual(result.tickMs.max);
    const bytes = result.bytesPerSecond;
    expect(bytes.toSpectators).toBeGreaterThan(0);
    expect(bytes.total).toBeCloseTo(bytes.toPlayers + bytes.toSpectators, 6);
    // A Widownia adds its spectators' traffic on top of the same players' traffic.
    expect(bytes.perSpectatedRoom).toBeGreaterThan(bytes.perRoom);
    expect(bytes.perSpectator * 8).toBeCloseTo(bytes.toSpectators, 6);
    expect(formatBench(result, 'l1-burza')).toContain(
      'server tick bench: 3 versus rooms on l1-burza, 24 players, 8 spectators, 10 ticks (3 rooms playing)',
    );
    expect(formatBench(result, 'l1-burza')).toContain('(target < 25 ms of the 50 ms tick)');
  });

  it('builds co-op rooms of 4 as the baseline', () => {
    const result = runServerTickBench({
      mode: 'coop',
      rooms: 2,
      spectatedRooms: 1,
      warmupTicks: 1,
      ticks: 4,
    });
    expect(result.mode).toBe('coop');
    expect(result.players).toBe(8);
    expect(result.spectators).toBe(8);
    expect(result.playing).toBe(2);
    expect(formatBench(result, 'l1-burza')).toContain('2 coop rooms on l1-burza, 8 players');
  });

  it('sends the spectator topic nothing when no room has spectators', () => {
    const result = runServerTickBench({ rooms: 2, spectatedRooms: 0, warmupTicks: 1, ticks: 4 });
    expect(result.spectators).toBe(0);
    expect(result.bytesPerSecond.toSpectators).toBe(0);
    expect(result.bytesPerSecond.perSpectatedRoom).toBe(0);
    expect(result.bytesPerSecond.perRoom).toBeGreaterThan(0);
  });
});
