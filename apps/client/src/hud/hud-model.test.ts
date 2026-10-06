import { describe, expect, test } from 'bun:test';
import { CREDIBILITY, DEADLINE_WARNING_MS, type Folder, SCORE } from '@redakcja/shared';
import {
  expiredToast,
  formatClock,
  formatCountdown,
  formatDelta,
  formatScore,
  isDeadlineWarning,
  locationLabel,
  pushToast,
  type StoryInfo,
  sortQueue,
  verdictToast,
} from './hud-model.ts';

function folder(id: string, deadlineMs: number, location: Folder['location']): Folder {
  return { id, storyId: 's', location, stamps: [], spawnedAtMs: 0, deadlineMs, warned: false };
}

const onConveyor = { kind: 'fixture', fixtureId: 'conveyor-0' } as const;

const story: StoryInfo = {
  headline: 'Rynek pod wodą',
  type: 'photo',
  priority: 'normal',
  truth: 'false',
};

describe('queue', () => {
  test('sorts by deadline, ties by id', () => {
    const order = sortQueue([
      folder('b', 30_000, onConveyor),
      folder('c', 10_000, onConveyor),
      folder('a', 30_000, onConveyor),
    ]).map((f) => f.id);
    expect(order).toEqual(['c', 'a', 'b']);
  });

  test('warns under the deadline warning threshold', () => {
    const f = folder('a', 50_000, onConveyor);
    expect(isDeadlineWarning(f, 50_000 - DEADLINE_WARNING_MS)).toBe(false);
    expect(isDeadlineWarning(f, 50_000 - DEADLINE_WARNING_MS + 1)).toBe(true);
  });

  test('labels where a folder is', () => {
    const nick = (id: string) => (id === 'p1' ? 'Zośka' : undefined);
    expect(locationLabel(folder('a', 0, { kind: 'carried', playerId: 'p1' }), nick)).toBe(
      'niesie Zośka',
    );
    expect(locationLabel(folder('a', 0, { kind: 'carried', playerId: 'p9' }), nick)).toBe(
      'w rękach',
    );
    expect(locationLabel(folder('a', 0, { kind: 'fixture', fixtureId: 'archive-1' }), nick)).toBe(
      'Archiwum',
    );
    expect(locationLabel(folder('a', 0, onConveyor), nick)).toBe('na taśmie');
    expect(locationLabel(folder('a', 0, { kind: 'fixture', fixtureId: 'desk-0' }), nick)).toBe(
      'na biurku',
    );
    expect(locationLabel(folder('a', 0, { kind: 'floor', x: 1, y: 2 }), nick)).toBe('na podłodze');
  });
});

describe('formatting', () => {
  test('clock rounds up and pads seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(-500)).toBe('0:00');
  });

  test('countdown shows tenths under ten seconds', () => {
    expect(formatCountdown(42_000)).toBe('0:42');
    expect(formatCountdown(10_000)).toBe('0:10');
    expect(formatCountdown(9_400)).toBe('9,4');
    expect(formatCountdown(9_401)).toBe('9,5');
    expect(formatCountdown(0)).toBe('0,0');
  });

  test('deltas use a real minus sign', () => {
    expect(formatDelta(30)).toBe('+30');
    expect(formatDelta(-20)).toBe('−20');
    expect(formatDelta(0)).toBe('0');
  });

  test('score groups thousands', () => {
    expect(formatScore(145)).toBe('145');
    expect(formatScore(-20)).toBe('−20');
    expect(formatScore(12_345)).toMatch(/^12\s345$/u);
  });
});

describe('toasts', () => {
  const base = {
    folderId: 'f1',
    storyId: 's',
    scoreDelta: -20,
    credibilityDelta: -25,
  } as const;

  test('a published fake reads as such, in red', () => {
    const slip = verdictToast({ ...base, verdict: 'publish', outcome: 'wrong' }, story, 0);
    expect(slip.title).toBe('Opublikowana fałszywka');
    expect(slip.tone).toBe('bad');
    expect(slip.mark).toBe('reject');
    expect(slip.headline).toBe(story.headline);
  });

  test('a rejected truth and a correct verdict', () => {
    expect(verdictToast({ ...base, verdict: 'reject', outcome: 'wrong' }, story, 0).title).toBe(
      'Odrzucona prawdziwa wiadomość',
    );
    const good = verdictToast(
      { ...base, verdict: 'reject', outcome: 'correct', scoreDelta: 30 },
      undefined,
      1,
    );
    expect(good.title).toBe('Trafny werdykt');
    expect(good.tone).toBe('good');
    expect(good.headline).toBe('Teczka bez opisu');
  });

  test('expiry follows the scoring table, free for unverifiable non-urgent stories', () => {
    const penalized = expiredToast({ folderId: 'f', storyId: 's' }, story, 0);
    expect(penalized.scoreDelta).toBe(SCORE.expired);
    expect(penalized.credibilityDelta).toBe(CREDIBILITY.expired);
    const free = expiredToast(
      { folderId: 'f', storyId: 's' },
      { ...story, truth: 'unverifiable' },
      1,
    );
    expect(free.scoreDelta).toBeNull();
    expect(free.credibilityDelta).toBe(0);
  });

  test('keeps at most three, newest first', () => {
    let list = pushToast(
      [],
      verdictToast({ ...base, verdict: 'publish', outcome: 'wrong' }, story, 0),
      3,
    );
    for (let i = 1; i < 5; i++) {
      list = pushToast(list, expiredToast({ folderId: `f${i}`, storyId: 's' }, story, i), 3);
    }
    expect(list.map((t) => t.id)).toEqual(['f4:4', 'f3:3', 'f2:2']);
  });
});
