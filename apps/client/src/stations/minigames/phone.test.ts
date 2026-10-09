import { describe, expect, test } from 'bun:test';
import {
  PHONE_CONTACT_COUNT,
  PHONE_HOLD_BEAT_MS,
  PHONE_QUEUE_MAX_MS,
  PHONE_QUEUE_MIN_MS,
} from '@redakcja/shared';
import {
  generatePuzzle,
  initialState,
  type PhoneState,
  queueSeconds,
  reduce,
} from './phone.logic.ts';

const STORY = { source: 'Komunikat prasowy ratusza' };

function run(state: PhoneState, ...actions: Parameters<typeof reduce>[1][]): PhoneState {
  return actions.reduce((s, a) => reduce(s, a)[0], state);
}

describe('phone puzzle', () => {
  test('same seed and story give the same phone book', () => {
    expect(generatePuzzle(5, STORY)).toEqual(generatePuzzle(5, STORY));
    expect(generatePuzzle(5, STORY)).not.toEqual(generatePuzzle(6, STORY));
  });

  for (let seed = 1; seed <= 200; seed++) {
    test(`seed ${seed}: exactly one right number, all names and numbers distinct`, () => {
      const p = generatePuzzle(seed, STORY);
      expect(p.contacts).toHaveLength(PHONE_CONTACT_COUNT);
      expect(p.contacts.filter((c) => c.name === p.target)).toHaveLength(1);
      expect(p.contacts[p.correctIndex]?.name).toBe(p.target);
      expect(new Set(p.contacts.map((c) => c.name)).size).toBe(PHONE_CONTACT_COUNT);
      expect(new Set(p.contacts.map((c) => c.number)).size).toBe(PHONE_CONTACT_COUNT);
      expect(p.queueMs).toBeGreaterThanOrEqual(PHONE_QUEUE_MIN_MS);
      expect(p.queueMs).toBeLessThanOrEqual(PHONE_QUEUE_MAX_MS);
    });
  }

  test('a source that is also a decoy name is not listed twice', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = generatePuzzle(seed, { source: 'mail od czytelnika' });
      const same = p.contacts.filter((c) => c.name.toLowerCase() === 'mail od czytelnika');
      expect(same).toHaveLength(1);
    }
  });

  test('the right answer is not always in the same place', () => {
    const spots = new Set(
      Array.from({ length: 40 }, (_, s) => generatePuzzle(s, STORY).correctIndex),
    );
    expect(spots.size).toBeGreaterThan(1);
  });
});

describe('phone rules', () => {
  const puzzle = generatePuzzle(3, STORY);
  const wrong = (puzzle.correctIndex + 1) % PHONE_CONTACT_COUNT;

  test('a wrong number fails at once, even for a reporter', () => {
    for (const skips of [false, true]) {
      const [s, effect] = reduce(initialState(puzzle, skips), { type: 'dial', index: wrong });
      expect(s.phase).toBe('failure');
      expect(effect).toBe('wrong');
    }
  });

  test('the right number puts a normal player in the queue', () => {
    const [s, effect] = reduce(initialState(puzzle, false), {
      type: 'dial',
      index: puzzle.correctIndex,
    });
    expect(s.phase).toBe('queue');
    expect(s.queueLeftMs).toBe(puzzle.queueMs);
    expect(effect).toBe('ringing');
  });

  test('the queue counts down, beats the hold music and connects at zero', () => {
    let s = run(initialState(puzzle, false), { type: 'dial', index: puzzle.correctIndex });
    let holds = 0;
    let connected = 0;
    for (let t = 0; t < puzzle.queueMs + 1000 && s.phase === 'queue'; t += 100) {
      const [next, effect] = reduce(s, { type: 'tick', dtMs: 100 });
      s = next;
      if (effect === 'hold') holds++;
      if (effect === 'connected') connected++;
    }
    expect(s.phase).toBe('success');
    expect(s.queueLeftMs).toBe(0);
    expect(connected).toBe(1);
    expect(holds).toBeGreaterThanOrEqual(Math.floor(puzzle.queueMs / PHONE_HOLD_BEAT_MS) - 1);
  });

  test('the reporter skips the queue', () => {
    const [s, effect] = reduce(initialState(puzzle, true), {
      type: 'dial',
      index: puzzle.correctIndex,
    });
    expect(s.phase).toBe('success');
    expect(effect).toBe('connected');
  });

  test('input is ignored once the call is decided; ticks only count in the queue', () => {
    const failed = run(initialState(puzzle, false), { type: 'dial', index: wrong });
    const after = run(
      failed,
      { type: 'dial', index: puzzle.correctIndex },
      { type: 'move', delta: 1 },
    );
    expect(after).toBe(failed);
    const fresh = initialState(puzzle, false);
    expect(reduce(fresh, { type: 'tick', dtMs: 1000 })[0]).toBe(fresh);
  });

  test('the cursor wraps and confirm dials the focused number', () => {
    let s = run(initialState(puzzle, false), { type: 'move', delta: -1 });
    expect(s.cursor).toBe(PHONE_CONTACT_COUNT - 1);
    s = run(s, { type: 'move', delta: 1 });
    expect(s.cursor).toBe(0);
    s = run(s, { type: 'move', delta: puzzle.correctIndex }, { type: 'confirm' });
    expect(s.phase).toBe('queue');
  });

  test('queue counter rounds up and never shows zero while waiting', () => {
    expect(queueSeconds(2001)).toBe(3);
    expect(queueSeconds(1)).toBe(1);
    expect(queueSeconds(0)).toBe(1);
  });
});
