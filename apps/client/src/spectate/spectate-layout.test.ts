import { describe, expect, test } from 'bun:test';
import {
  backFocus,
  chooseSpectateLayout,
  isPhoneViewport,
  nextFocus,
  tapTeam,
  teamKeyFocus,
  visibleTeams,
} from './spectate-layout.ts';

describe('chooseSpectateLayout', () => {
  test.each([
    [1366, 768, 'side'],
    [1280, 720, 'side'],
    [1024, 768, 'side'],
    [1920, 1080, 'side'],
    [863, 360, 'single'],
    [915, 412, 'single'],
    [640, 360, 'single'],
    [768, 1024, 'stacked'],
    [1000, 900, 'stacked'],
    [390, 844, 'single'],
    [999, 700, 'single'],
  ] as const)('%i×%i with two teams → %s', (width, height, layout) => {
    expect(chooseSpectateLayout({ width, height }, 2)).toBe(layout);
  });

  test('one team (co-op) is always single', () => {
    expect(chooseSpectateLayout({ width: 1366, height: 768 }, 1)).toBe('single');
    expect(chooseSpectateLayout({ width: 768, height: 1024 }, 1)).toBe('single');
  });

  test('a phone is always single, however wide', () => {
    expect(chooseSpectateLayout({ width: 1024, height: 500 }, 2, true)).toBe('single');
    expect(chooseSpectateLayout({ width: 1366, height: 768 }, 2, true)).toBe('single');
  });
});

describe('isPhoneViewport', () => {
  test('a touch screen with a short side under 600 px is a phone', () => {
    expect(isPhoneViewport({ width: 915, height: 412 }, true)).toBe(true);
    expect(isPhoneViewport({ width: 640, height: 360 }, true)).toBe(true);
    expect(isPhoneViewport({ width: 390, height: 844 }, true)).toBe(true);
  });

  test('a tablet or a mouse is not', () => {
    expect(isPhoneViewport({ width: 768, height: 1024 }, true)).toBe(false);
    expect(isPhoneViewport({ width: 640, height: 360 }, false)).toBe(false);
  });
});

describe('visibleTeams', () => {
  test('a split shows both newsrooms, a focus one', () => {
    expect(visibleTeams('side', [0, 1], 'split')).toEqual([0, 1]);
    expect(visibleTeams('stacked', [0, 1], 'split')).toEqual([0, 1]);
    expect(visibleTeams('side', [0, 1], 1)).toEqual([1]);
  });

  test('single shows the picked team, Kurier before any pick', () => {
    expect(visibleTeams('single', [0, 1], 'split')).toEqual([0]);
    expect(visibleTeams('single', [0, 1], 1)).toEqual([1]);
  });

  test('co-op shows its one newsroom whatever the focus', () => {
    expect(visibleTeams('single', [0], 1)).toEqual([0]);
    expect(visibleTeams('single', [], 'split')).toEqual([]);
  });
});

describe('nextFocus', () => {
  test('a split cycles both → Kurier → Głos → both', () => {
    expect(nextFocus('side', [0, 1], 'split')).toBe(0);
    expect(nextFocus('side', [0, 1], 0)).toBe(1);
    expect(nextFocus('side', [0, 1], 1)).toBe('split');
  });

  test('single swaps the two teams', () => {
    expect(nextFocus('single', [0, 1], 'split')).toBe(1);
    expect(nextFocus('single', [0, 1], 1)).toBe(0);
    expect(nextFocus('single', [0, 1], 0)).toBe(1);
  });

  test('co-op has nothing to toggle', () => {
    expect(nextFocus('single', [0], 'split')).toBe('split');
  });
});

describe('tapTeam', () => {
  test('in a split a tap focuses the team, a second tap brings both back', () => {
    expect(tapTeam('side', [0, 1], 'split', 1)).toBe(1);
    expect(tapTeam('side', [0, 1], 1, 1)).toBe('split');
    expect(tapTeam('side', [0, 1], 0, 1)).toBe(1);
  });

  test('in single a tap shows that team', () => {
    expect(tapTeam('single', [0, 1], 'split', 1)).toBe(1);
    expect(tapTeam('single', [0, 1], 1, 1)).toBe(1);
    expect(tapTeam('single', [0, 1], 1, 0)).toBe(0);
  });

  test('a team that is not playing changes nothing', () => {
    expect(tapTeam('single', [0], 'split', 1)).toBe('split');
  });
});

describe('backFocus and team keys', () => {
  test('back leaves a focused split, nothing else', () => {
    expect(backFocus('side', 1)).toBe('split');
    expect(backFocus('side', 'split')).toBeNull();
    expect(backFocus('single', 1)).toBeNull();
  });

  test('1 and 2 pick Kurier and Głos in versus only', () => {
    expect(teamKeyFocus([0, 1], 'Digit1')).toBe(0);
    expect(teamKeyFocus([0, 1], 'Numpad2')).toBe(1);
    expect(teamKeyFocus([0, 1], 'Digit3')).toBeNull();
    expect(teamKeyFocus([0], 'Digit1')).toBeNull();
  });
});
