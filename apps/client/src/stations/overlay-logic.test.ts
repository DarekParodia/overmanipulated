import { describe, expect, it } from 'bun:test';
import { handleNavKey, type NavIntent, subscribeNav } from '../input/ui-nav.ts';
import { formatCountdown, moveFocus, secondsLeft, seedFromId, signed } from './overlay-logic.ts';

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
