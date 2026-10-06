import { describe, expect, test } from 'bun:test';
import { ARCHIVE_CARD_COUNT, ARCHIVE_TOPIC_MENTIONS } from '@redakcja/shared';
import {
  centeredIndex,
  createArchivePuzzle,
  evaluateStop,
  isCoasting,
  nudge,
  releaseVelocity,
  SCROLL,
  type ScrollState,
  seek,
  stepScroll,
  stop,
} from './archive.logic.ts';

const TOPICS = 10;

function settle(state: ScrollState, cards: number, seconds = 5): ScrollState {
  let s = state;
  for (let t = 0; t < seconds; t += 1 / 60) {
    s = stepScroll(s, 1 / 60, cards);
  }
  return s;
}

function dayValue(d: { year: number; month: number; day: number }): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

describe('archive puzzle', () => {
  test('same seed gives the same drawer', () => {
    expect(createArchivePuzzle(7, TOPICS)).toEqual(createArchivePuzzle(7, TOPICS));
    expect(createArchivePuzzle(7, TOPICS)).not.toEqual(createArchivePuzzle(8, TOPICS));
  });

  for (let seed = 1; seed <= 200; seed++) {
    test(`seed ${seed}: one earliest mention, dates strictly increasing`, () => {
      const p = createArchivePuzzle(seed, TOPICS);
      expect(p.cards).toHaveLength(ARCHIVE_CARD_COUNT);
      const mentions = p.cards.flatMap((c, i) => (c.topic === p.topic ? [i] : []));
      expect(mentions).toHaveLength(ARCHIVE_TOPIC_MENTIONS);
      expect(mentions[0]).toBe(p.targetIndex);
      expect(p.targetIndex).toBeGreaterThanOrEqual(2);
      expect(p.targetIndex).toBeLessThan(ARCHIVE_CARD_COUNT / 2);
      expect(p.startIndex).toBe(ARCHIVE_CARD_COUNT - 1);
      for (let i = 1; i < p.cards.length; i++) {
        const prev = p.cards[i - 1];
        const card = p.cards[i];
        if (!prev || !card) throw new Error('missing card');
        expect(dayValue(card.date)).toBeGreaterThan(dayValue(prev.date));
        expect(card.edition).toBeGreaterThan(prev.edition);
        expect(card.topic).not.toBe(prev.topic);
      }
    });
  }

  test('only the earliest mention is a hit; repeated wrong pulls are not new mistakes', () => {
    const p = createArchivePuzzle(3, TOPICS);
    const laterMention = p.cards.findIndex((c, i) => c.topic === p.topic && i > p.targetIndex);
    expect(evaluateStop(p, p.targetIndex, new Set())).toBe('found');
    expect(evaluateStop(p, laterMention, new Set())).toBe('wrong');
    expect(evaluateStop(p, laterMention, new Set([laterMention]))).toBe('repeat');
  });

  test('rejects too few topics', () => {
    expect(() => createArchivePuzzle(1, 2)).toThrow();
  });
});

describe('archive scroll', () => {
  const cards = 14;
  const at = (pos: number): ScrollState => ({ pos, vel: 0, target: null });

  test('one nudge moves exactly one card', () => {
    expect(settle(nudge(at(5), SCROLL.nudge), cards).pos).toBe(6);
    expect(settle(nudge(at(5), -SCROLL.nudge), cards).pos).toBe(4);
  });

  test('repeated nudges build speed and coast further', () => {
    let s = at(2);
    for (let i = 0; i < 3; i++) s = nudge(s, SCROLL.nudge);
    expect(isCoasting(s)).toBe(true);
    expect(settle(s, cards).pos).toBeGreaterThanOrEqual(4);
  });

  test('speed is capped and the drawer stops at its ends', () => {
    let s = at(12);
    for (let i = 0; i < 50; i++) s = nudge(s, SCROLL.nudge);
    expect(s.vel).toBe(SCROLL.maxSpeed);
    expect(settle(s, cards).pos).toBe(cards - 1);
    expect(settle(nudge(at(0), -SCROLL.maxSpeed), cards).pos).toBe(0);
  });

  test('stop settles on the nearest card', () => {
    const s = stop({ pos: 6.4, vel: 10, target: null }, cards);
    expect(isCoasting(s)).toBe(false);
    expect(centeredIndex(s, cards)).toBe(6);
    expect(settle(s, cards).pos).toBe(6);
  });

  test('seek eases to a tapped card', () => {
    expect(settle(seek(at(3), 9, cards), cards).pos).toBe(9);
    expect(settle(seek(at(3), 99, cards), cards).pos).toBe(cards - 1);
  });

  test('release velocity follows the last moves; a pause before lifting means no fling', () => {
    const moves = [
      { t: 0, pos: 0 },
      { t: 50, pos: 0.5 },
      { t: 100, pos: 1 },
    ];
    expect(releaseVelocity([], 0)).toBe(0);
    expect(releaseVelocity(moves, 110)).toBeCloseTo(10);
    expect(releaseVelocity(moves, 400)).toBe(0);
    // Sparse events (one move per 200 ms) still give a speed.
    expect(
      releaseVelocity(
        [
          { t: 0, pos: 0 },
          { t: 200, pos: 2 },
        ],
        210,
      ),
    ).toBeCloseTo(10);
    expect(releaseVelocity([{ t: 0, pos: 3 }], 5)).toBe(0);
  });
});
