import { describe, expect, it } from 'bun:test';
import {
  chunkIndexAt,
  fallbackMs,
  type IntroAction,
  type IntroState,
  introReducer,
  sceneDurationMs,
  sceneDurations,
  sceneElapsedMs,
  shouldAutoplayIntro,
  startIntro,
  subtitleChunks,
  subtitleIndexAt,
} from './intro-model.ts';

const words = (n: number) => Array.from({ length: n }, (_, i) => `słowo${i}`).join(' ');

function run(state: IntroState, actions: readonly IntroAction[], durations: readonly number[]) {
  return actions.reduce((s, a) => introReducer(s, a, durations), state);
}

describe('fallbackMs', () => {
  it('reads 400 ms per word, clamped to 2.5–12 s', () => {
    expect(fallbackMs('a b c')).toBe(2500);
    expect(fallbackMs(words(12))).toBe(4800);
    expect(fallbackMs(words(40))).toBe(12000);
    expect(fallbackMs('')).toBe(2500);
  });

  it('counts words, not dashes or lone punctuation', () => {
    expect(fallbackMs('raz – dwa – trzy – cztery – pięć – sześć – siedem')).toBe(2800);
  });
});

describe('sceneDurationMs', () => {
  it('is the clip plus 1500 ms with a voice, the fallback without', () => {
    expect(sceneDurationMs('a b c', 3200)).toBe(4700);
    expect(sceneDurationMs(words(12), null)).toBe(4800);
  });
});

describe('sceneDurations (S7-101)', () => {
  it('times the voiced scene by its clip and every other one by its reading time', () => {
    const lines = ['a b c', words(12), words(40)];
    expect(sceneDurations(lines, null, null)).toEqual([2500, 4800, 12000]);
    expect(sceneDurations(lines, 1, 3000)).toEqual([2500, 4500, 12000]);
    // A voiced scene whose clip is unknown falls back to its reading time.
    expect(sceneDurations(lines, 1, null)).toEqual([2500, 4800, 12000]);
  });
});

describe('subtitleIndexAt (S7-101)', () => {
  const line = 'Raz dwa trzy. Cztery pięć!';

  it('follows the voice: chunks are timed over the clip while it plays', () => {
    // 14 of 26 characters: the second sentence shows from 1077 ms of a 2000 ms clip.
    expect(subtitleIndexAt(line, 2000, 1076)).toBe(0);
    expect(subtitleIndexAt(line, 2000, 1077)).toBe(1);
  });

  it('follows the reading time without a voice', () => {
    // Five words read in 2500 ms (the minimum): the second sentence from 1346 ms.
    expect(subtitleIndexAt(line, null, 1100)).toBe(0);
    expect(subtitleIndexAt(line, null, 1346)).toBe(1);
  });
});

describe('subtitleChunks', () => {
  it('splits at sentence ends and times chunks by their share of characters', () => {
    expect(subtitleChunks('Raz dwa trzy. Cztery pięć!', 4000)).toEqual([
      { text: 'Raz dwa trzy.', atMs: 0 },
      { text: 'Cztery pięć!', atMs: 2154 },
    ]);
  });

  it('keeps a single sentence whole and splits after an ellipsis or question mark', () => {
    expect(subtitleChunks('Do roboty!', 3000)).toEqual([{ text: 'Do roboty!', atMs: 0 }]);
    expect(subtitleChunks('Gotowi? Czekaj… Już.', 1000)).toEqual([
      { text: 'Gotowi?', atMs: 0 },
      { text: 'Czekaj…', atMs: 400 },
      { text: 'Już.', atMs: 800 },
    ]);
  });

  it('never splits at a non-breaking space', () => {
    expect(subtitleChunks('Witaj w\u00a0redakcji. A\u00a0teraz praca.', 1000)).toEqual([
      { text: 'Witaj w\u00a0redakcji.', atMs: 0 },
      { text: 'A\u00a0teraz praca.', atMs: 563 },
    ]);
    expect(subtitleChunks('Biuro na ul.\u00a0Długiej. Już.', 1000)).toEqual([
      { text: 'Biuro na ul.\u00a0Długiej.', atMs: 0 },
      { text: 'Już.', atMs: 846 },
    ]);
  });

  it('finds the chunk on screen', () => {
    const chunks = subtitleChunks('Raz dwa trzy. Cztery pięć!', 4000);
    expect(chunkIndexAt(chunks, 0)).toBe(0);
    expect(chunkIndexAt(chunks, 2153)).toBe(0);
    expect(chunkIndexAt(chunks, 2154)).toBe(1);
    expect(chunkIndexAt(chunks, 9999)).toBe(1);
  });
});

describe('introReducer', () => {
  const durations = [2500, 4800, 12000];

  it('advances at the fallback times with a muted voice', () => {
    let state = introReducer(startIntro(0), { type: 'start', now: 1000 }, durations);
    const changes: [number, number][] = [];
    for (let now = 1000; now <= 21000; now += 100) {
      const next = introReducer(state, { type: 'tick', now }, durations);
      if (next.index !== state.index || next.done !== state.done) {
        changes.push([now, next.done ? -1 : next.index]);
      }
      state = next;
    }
    expect(changes).toEqual([
      [3500, 1],
      [8300, 2],
      [20300, -1],
    ]);
    expect(state).toEqual({
      index: 2,
      startedAt: 8300,
      endedAt: null,
      pausedAt: null,
      pausedTotal: 0,
      done: true,
    });
  });

  it('restarts the current scene: its clock, its clip end and any pause (S7-101)', () => {
    let state = startIntro(0);
    state = run(
      state,
      [
        { type: 'next', now: 1000 },
        { type: 'clipEnded', now: 2000 },
        { type: 'togglePause', now: 2100 },
        { type: 'restart', now: 5000 },
      ],
      durations,
    );
    expect(state).toEqual({
      index: 1,
      startedAt: 5000,
      endedAt: null,
      pausedAt: null,
      pausedTotal: 0,
      done: false,
    });
    expect(
      introReducer({ ...state, done: true }, { type: 'restart', now: 6000 }, durations).done,
    ).toBe(true);
  });

  it('moves on 450 ms after the clip ends, before the grace time runs out', () => {
    const voiced = [sceneDurationMs('', 3000), sceneDurationMs('', 3000)];
    let state = startIntro(0);
    state = run(state, [{ type: 'clipEnded', now: 3000 }], voiced);
    expect(introReducer(state, { type: 'tick', now: 3449 }, voiced).index).toBe(0);
    state = introReducer(state, { type: 'tick', now: 3450 }, voiced);
    expect(state).toEqual({
      index: 1,
      startedAt: 3450,
      endedAt: null,
      pausedAt: null,
      pausedTotal: 0,
      done: false,
    });
    // The clip's end is lost: the grace time (clip + 1500 ms) still moves it on.
    expect(introReducer(state, { type: 'tick', now: 7949 }, voiced).done).toBe(false);
    expect(introReducer(state, { type: 'tick', now: 7950 }, voiced).done).toBe(true);
  });

  it('holds while paused and does not count the pause', () => {
    let state = run(
      startIntro(0),
      [
        { type: 'tick', now: 1000 },
        { type: 'togglePause', now: 1000 },
        { type: 'tick', now: 9000 },
      ],
      durations,
    );
    expect(state.index).toBe(0);
    expect(state.pausedAt).toBe(1000);
    expect(sceneElapsedMs(state, 9000)).toBe(1000);
    state = introReducer(state, { type: 'togglePause', now: 9000 }, durations);
    expect(state.pausedTotal).toBe(8000);
    expect(sceneElapsedMs(state, 10000)).toBe(2000);
    expect(introReducer(state, { type: 'tick', now: 10499 }, durations).index).toBe(0);
    expect(introReducer(state, { type: 'tick', now: 10500 }, durations).index).toBe(1);
  });

  it('shifts a clip end by the pause after it', () => {
    const state = run(
      startIntro(0),
      [
        { type: 'clipEnded', now: 2000 },
        { type: 'togglePause', now: 2100 },
        { type: 'togglePause', now: 5100 },
      ],
      durations,
    );
    expect(state.endedAt).toBe(5000);
    expect(introReducer(state, { type: 'tick', now: 5449 }, durations).index).toBe(0);
    expect(introReducer(state, { type: 'tick', now: 5450 }, durations).index).toBe(1);
  });

  it('counts the gap from the resume when the clip ends during a pause', () => {
    const state = run(
      startIntro(0),
      [
        { type: 'togglePause', now: 2000 },
        { type: 'clipEnded', now: 2600 },
        { type: 'togglePause', now: 6000 },
      ],
      durations,
    );
    expect(state.endedAt).toBe(6000);
    expect(introReducer(state, { type: 'tick', now: 6449 }, durations).index).toBe(0);
    expect(introReducer(state, { type: 'tick', now: 6450 }, durations).index).toBe(1);
  });

  it('steps with Next and Back, which restart the scene and clear a pause', () => {
    let state = run(
      startIntro(0),
      [
        { type: 'togglePause', now: 500 },
        { type: 'next', now: 700 },
      ],
      durations,
    );
    expect(state).toEqual({
      index: 1,
      startedAt: 700,
      endedAt: null,
      pausedAt: null,
      pausedTotal: 0,
      done: false,
    });
    state = run(
      state,
      [
        { type: 'prev', now: 900 },
        { type: 'prev', now: 1000 },
      ],
      durations,
    );
    expect(state.index).toBe(0);
    expect(state.startedAt).toBe(1000);
    state = run(
      state,
      [
        { type: 'next', now: 1100 },
        { type: 'next', now: 1200 },
        { type: 'next', now: 1300 },
      ],
      durations,
    );
    expect(state.done).toBe(true);
    expect(state.index).toBe(2);
  });

  it('finishes at once on Skip and ignores everything after but a new start', () => {
    const skipped = run(startIntro(0), [{ type: 'skip' }], durations);
    expect(skipped.done).toBe(true);
    expect(skipped.index).toBe(0);
    expect(
      run(
        skipped,
        [
          { type: 'next', now: 10 },
          { type: 'tick', now: 99999 },
        ],
        durations,
      ),
    ).toBe(skipped);
    expect(introReducer(skipped, { type: 'start', now: 50 }, durations)).toEqual(startIntro(50));
  });

  it('is done at once with no scenes', () => {
    expect(introReducer(startIntro(0), { type: 'start', now: 0 }, []).done).toBe(true);
  });
});

describe('shouldAutoplayIntro', () => {
  const base = {
    screen: 'lobby',
    levelId: 'l0-greybox',
    seen: false,
    spectator: false,
    open: false,
  } as const;

  it('plays in the lobby on the training level for a player who has not seen it', () => {
    expect(shouldAutoplayIntro(base)).toBe(true);
  });

  it('does not play anywhere else, twice, for spectators or over itself', () => {
    expect(shouldAutoplayIntro({ ...base, levelId: 'l1-burza' })).toBe(false);
    expect(shouldAutoplayIntro({ ...base, levelId: 'endless' })).toBe(false);
    expect(shouldAutoplayIntro({ ...base, screen: 'mainMenu' })).toBe(false);
    expect(shouldAutoplayIntro({ ...base, screen: 'game' })).toBe(false);
    expect(shouldAutoplayIntro({ ...base, seen: true })).toBe(false);
    expect(shouldAutoplayIntro({ ...base, spectator: true })).toBe(false);
    expect(shouldAutoplayIntro({ ...base, open: true })).toBe(false);
  });
});
