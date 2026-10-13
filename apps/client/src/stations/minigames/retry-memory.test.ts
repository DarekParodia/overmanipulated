import { afterEach, describe, expect, it } from 'bun:test';
import {
  afterCancel,
  afterFailure,
  KARTOTEKA_RESUME_MIN_MS,
  recallCard,
  remainingAfter,
  roundClockMs,
  useRetryMemory,
  withCircled,
} from './retry-memory.ts';

afterEach(() => useRetryMemory.getState().reset());

describe('roundClockMs', () => {
  it('gives a card seen for the first time the full 20 s', () => {
    expect(roundClockMs(undefined)).toBe(20_000);
    expect(roundClockMs(withCircled(undefined, 7, [true]))).toBe(20_000);
  });

  it('resumes a card put down at 15 s of 20 at 5 s', () => {
    const entry = afterCancel(undefined, 7, remainingAfter(20_000, 15_000));
    expect(entry.remainingMs).toBe(5000);
    expect(roundClockMs(entry)).toBe(5000);
  });

  it('resumes a card put down at 18 s of 20 at the 5 s floor', () => {
    expect(KARTOTEKA_RESUME_MIN_MS).toBe(5000);
    const entry = afterCancel(undefined, 7, remainingAfter(20_000, 18_000));
    expect(entry.remainingMs).toBe(2000);
    expect(roundClockMs(entry)).toBe(5000);
  });

  it('keeps what was left after an early cancel and counts on from a resumed clock', () => {
    const first = afterCancel(undefined, 7, remainingAfter(20_000, 4000));
    expect(roundClockMs(first)).toBe(16_000);
    const second = afterCancel(first, 7, remainingAfter(roundClockMs(first), 6000));
    expect(roundClockMs(second)).toBe(10_000);
  });

  it('never exceeds the round limit', () => {
    expect(roundClockMs(afterCancel(undefined, 7, 12_000), 15_000)).toBe(12_000);
    expect(roundClockMs(afterCancel(undefined, 7, 3000), 4000)).toBe(4000);
  });

  it('restarts in full after a failure and keeps the circles', () => {
    const cancelled = afterCancel(withCircled(undefined, 7, [false, true]), 7, 3000);
    const failed = afterFailure(cancelled, 7);
    expect(failed).toEqual({ seed: 7, circled: [false, true], remainingMs: null });
    expect(roundClockMs(failed)).toBe(20_000);
  });

  it('never leaves a negative time', () => {
    expect(remainingAfter(5000, 5100)).toBe(0);
    expect(afterCancel(undefined, 7, -40).remainingMs).toBe(0);
  });
});

describe('useRetryMemory', () => {
  it('keeps the circles and the clock per seed', () => {
    const memory = useRetryMemory.getState();
    memory.rememberCircled(7, [true, false]);
    memory.rememberCancel(7, 6500);
    memory.rememberCircled(9, [false, false, true]);
    expect(recallCard(7)).toEqual({ seed: 7, circled: [true, false], remainingMs: 6500 });
    expect(recallCard(9)).toEqual({ seed: 9, circled: [false, false, true], remainingMs: null });
    expect(recallCard(8)).toBeUndefined();
  });

  it('keeps the clock when the circles change and drops it on a failure', () => {
    const memory = useRetryMemory.getState();
    memory.rememberCancel(7, 6500);
    memory.rememberCircled(7, [true]);
    expect(recallCard(7)).toEqual({ seed: 7, circled: [true], remainingMs: 6500 });
    memory.rememberFailure(7);
    expect(recallCard(7)).toEqual({ seed: 7, circled: [true], remainingMs: null });
  });

  it('remembers a card failed on time before anything was circled', () => {
    useRetryMemory.getState().rememberFailure(7);
    expect(recallCard(7)).toEqual({ seed: 7, circled: [], remainingMs: null });
  });

  it('forgets a filed card and everything on reset', () => {
    const memory = useRetryMemory.getState();
    memory.rememberCircled(7, [true]);
    memory.rememberCircled(9, [true]);
    memory.forget(7);
    memory.forget(8);
    expect(recallCard(7)).toBeUndefined();
    expect(recallCard(9)).toBeDefined();
    memory.reset();
    expect(useRetryMemory.getState().entries).toEqual({});
  });
});
