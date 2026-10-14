import { describe, expect, it } from 'bun:test';
import { handleNavKey, type NavIntent, subscribeNav } from '../input/ui-nav.ts';
import {
  formatCountdown,
  minigameElapsed,
  minigameRemaining,
  moveFocus,
  pauseMinigameClock,
  resumeMinigameClock,
  secondsLeft,
  seedFromId,
  signed,
  startMinigameClock,
} from './overlay-logic.ts';

const grid = [['stamp-a'], ['stamp-b'], ['v:publish', 'v:reject', 'v:context'], [], ['close']];

describe('desk focus navigation', () => {
  it('starts on the first item when nothing is focused', () => {
    expect(moveFocus(grid, null, 'down')).toBe('stamp-a');
    expect(moveFocus(grid, 'gone', 'right')).toBe('stamp-a');
  });

  it('moves between rows and keeps the column where it can', () => {
    expect(moveFocus(grid, 'stamp-b', 'down')).toBe('v:publish');
    expect(moveFocus(grid, 'v:context', 'up')).toBe('stamp-b');
    expect(moveFocus(grid, 'v:context', 'down')).toBe('close');
  });

  it('skips empty rows and clamps at the edges', () => {
    expect(moveFocus(grid, 'close', 'up')).toBe('v:publish');
    expect(moveFocus(grid, 'close', 'down')).toBe('close');
    expect(moveFocus(grid, 'stamp-a', 'up')).toBe('stamp-a');
    expect(moveFocus(grid, 'v:publish', 'left')).toBe('v:publish');
    expect(moveFocus(grid, 'v:reject', 'right')).toBe('v:context');
    expect(moveFocus(grid, 'v:context', 'right')).toBe('v:context');
  });

  it('leaves the focus alone on confirm and back', () => {
    expect(moveFocus(grid, 'v:reject', 'confirm')).toBe('v:reject');
    expect(moveFocus(grid, 'v:reject', 'back')).toBe('v:reject');
  });
});

describe('formatting', () => {
  it('signs deltas with a typographic minus', () => {
    expect(signed(12)).toBe('+12');
    expect(signed(-5)).toBe('−5');
    expect(signed(0)).toBe('0');
  });

  it('counts down in whole seconds, rounding up', () => {
    expect(secondsLeft(1)).toBe(1);
    expect(secondsLeft(0)).toBe(0);
    expect(secondsLeft(-300)).toBe(0);
    expect(formatCountdown(19_001)).toBe('20 s');
    expect(formatCountdown(75_000)).toBe('1:15');
  });

  it('derives the same stamp seed from the same id', () => {
    expect(seedFromId('l0-zalany-rynek-image')).toBe(seedFromId('l0-zalany-rynek-image'));
    expect(seedFromId('a')).not.toBe(seedFromId('b'));
    expect(seedFromId('x')).toBeGreaterThanOrEqual(0);
  });
});

describe('overlay navigation stack', () => {
  const key = (code: string) =>
    ({ code, repeat: false, preventDefault() {} }) as unknown as KeyboardEvent;

  it('lets a frame take back and pass everything else to the minigame inside', () => {
    const minigame: NavIntent[] = [];
    const frame: NavIntent[] = [];
    const offMinigame = subscribeNav((intent) => {
      minigame.push(intent);
    });
    const offFrame = subscribeNav((intent) => {
      if (intent !== 'back') {
        return false;
      }
      frame.push(intent);
      return true;
    });
    handleNavKey(key('ArrowLeft'));
    handleNavKey(key('Escape'));
    handleNavKey(key('Enter'));
    offFrame();
    offMinigame();
    expect(frame).toEqual(['back']);
    expect(minigame).toEqual(['left', 'confirm']);
  });

  it('gives intents only to the newest subscriber when it handles them', () => {
    const older: NavIntent[] = [];
    const newer: NavIntent[] = [];
    const offOlder = subscribeNav((intent) => older.push(intent));
    const offNewer = subscribeNav((intent) => {
      newer.push(intent);
    });
    handleNavKey(key('KeyW'));
    offNewer();
    offOlder();
    expect(newer).toEqual(['up']);
    expect(older).toEqual([]);
  });
});

describe('minigame clock with pauses (S7-95)', () => {
  it('leaves the paused stretch out: start 0, pause 3000–8000, now 10000 → 5000', () => {
    expect(minigameElapsed(10000, 0, 5000, null)).toBe(5000);
    let clock = startMinigameClock(0, false);
    clock = pauseMinigameClock(clock, 3000);
    expect(minigameElapsed(6000, clock.startedAt, clock.pausedTotal, clock.pausedAt)).toBe(3000);
    clock = resumeMinigameClock(clock, 8000);
    expect(clock).toEqual({ startedAt: 0, pausedTotal: 5000, pausedAt: null });
    expect(minigameElapsed(10000, clock.startedAt, clock.pausedTotal, clock.pausedAt)).toBe(5000);
  });

  it('stands still from the start while the first-use card is up', () => {
    const clock = startMinigameClock(1000, true);
    expect(clock).toEqual({ startedAt: 1000, pausedTotal: 0, pausedAt: 1000 });
    expect(minigameElapsed(9000, clock.startedAt, clock.pausedTotal, clock.pausedAt)).toBe(0);
    const running = resumeMinigameClock(clock, 4000);
    expect(running).toEqual({ startedAt: 1000, pausedTotal: 3000, pausedAt: null });
    expect(minigameElapsed(6000, running.startedAt, running.pausedTotal, null)).toBe(2000);
  });

  it('ignores a second pause or a resume of a running clock', () => {
    const paused = pauseMinigameClock(startMinigameClock(0, false), 2000);
    expect(pauseMinigameClock(paused, 5000)).toEqual(paused);
    const running = startMinigameClock(0, false);
    expect(resumeMinigameClock(running, 5000)).toEqual(running);
    expect(minigameElapsed(500, 1000, 0, null)).toBe(0);
  });

  it('counts down from the full limit, or from resumeMs on a resumed round', () => {
    expect(minigameRemaining(20000, 0)).toBe(20000);
    expect(minigameRemaining(20000, 5000)).toBe(15000);
    expect(minigameRemaining(20000, 0, 4000)).toBe(4000);
    expect(minigameRemaining(20000, 1500, 4000)).toBe(2500);
    expect(minigameRemaining(20000, 9000, 4000)).toBe(0);
  });
});
