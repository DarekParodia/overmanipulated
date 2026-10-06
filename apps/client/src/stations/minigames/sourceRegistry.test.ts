import { describe, expect, it } from 'bun:test';
import { STORIES, type Stamp, type Story } from '@redakcja/content';
import {
  SOURCE_REGISTRY_FIELDS,
  SOURCE_REGISTRY_MAX_FLAGS,
  SOURCE_REGISTRY_MIN_FLAGS,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import {
  type Action,
  type Effect,
  flagCount,
  type GameState,
  generateCard,
  initialState,
  reduce,
  type SourceCard,
} from './sourceRegistry.logic.ts';

const base = STORIES[0] as Story;
const story = (patch: Partial<Story>): Story => ({ ...base, ...patch });
const stamp = (relevance: Stamp['relevance']): Stamp => ({
  id: 'test-source',
  station: 'sourceRegistry',
  text: 'Test',
  relevance,
});

function run(state: GameState, actions: Action[]): [GameState, (Effect | null)[]] {
  const effects: (Effect | null)[] = [];
  let current = state;
  for (const action of actions) {
    const [next, effect] = reduce(current, action);
    current = next;
    effects.push(effect);
  }
  return [current, effects];
}

/** A card with flags, found by scanning seeds (stampless stories are random). */
function flaggedCard(min = 1): SourceCard {
  for (let seed = 1; seed < 500; seed++) {
    const card = generateCard(seed, story({ type: 'post' }), undefined);
    if (flagCount(card) >= min) {
      return card;
    }
  }
  throw new Error('no flagged card');
}

describe('generateCard', () => {
  it('is deterministic for the same seed', () => {
    const s = story({ type: 'post' });
    expect(generateCard(7, s, undefined)).toEqual(generateCard(7, s, undefined));
  });

  it('varies with the seed', () => {
    const s = story({ type: 'post' });
    const cards = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(generateCard(i, s, undefined))),
    );
    expect(cards.size).toBeGreaterThan(10);
  });

  it('has the configured number of fields and a flag count in range or zero', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const type of ['post', 'article'] as const) {
        const card = generateCard(seed, story({ type }), undefined);
        expect(card.fields).toHaveLength(SOURCE_REGISTRY_FIELDS);
        const n = flagCount(card);
        expect(n === 0 || (n >= SOURCE_REGISTRY_MIN_FLAGS && n <= SOURCE_REGISTRY_MAX_FLAGS)).toBe(
          true,
        );
        for (const field of card.fields) {
          expect(field.value.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives both clean and flagged cards without a stamp', () => {
    const counts = Array.from({ length: 100 }, (_, i) =>
      flagCount(generateCard(i, story({ type: 'post' }), undefined)),
    );
    expect(counts.some((n) => n === 0)).toBe(true);
    expect(counts.some((n) => n > 0)).toBe(true);
  });

  it('picks the card kind from the story type', () => {
    expect(generateCard(1, story({ type: 'post' }), undefined).kind).toBe('account');
    expect(generateCard(1, story({ type: 'article' }), undefined).kind).toBe('website');
  });

  it('matches the stamp: decisive on an untrue story always has flags', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const truth of ['false', 'misleading', 'unverifiable'] as const) {
        expect(flagCount(generateCard(seed, story({ truth }), stamp('decisive')))).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it('matches the stamp: decisive on a true story and irrelevant stamps are clean', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(flagCount(generateCard(seed, story({ truth: 'true' }), stamp('decisive')))).toBe(0);
      expect(flagCount(generateCard(seed, story({ truth: 'false' }), stamp('irrelevant')))).toBe(0);
    }
  });

  it('matches the stamp: misleading stamp on a true story shows a dodgy-looking source', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(
        flagCount(generateCard(seed, story({ truth: 'true' }), stamp('misleading'))),
      ).toBeGreaterThan(0);
    }
  });
});

describe('field pools', () => {
  it('every card kind has enough slots, each with clean and flagged values', () => {
    for (const pools of Object.values(pl.minigames.sourceRegistry.fields)) {
      const slots = Object.values(pools);
      expect(slots.length).toBeGreaterThanOrEqual(SOURCE_REGISTRY_FIELDS);
      for (const slot of slots) {
        expect(slot.label.length).toBeGreaterThan(0);
        expect(slot.clean.length).toBeGreaterThan(0);
        expect(slot.flagged.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('reduce', () => {
  it('succeeds when every warning sign is circled and the card is filed', () => {
    const card = flaggedCard();
    const toggles = card.fields.flatMap((f, i): Action[] =>
      f.flagged ? [{ type: 'toggle', index: i }] : [],
    );
    const [state, effects] = run(initialState(card), [...toggles, { type: 'file' }]);
    expect(state.outcome).toBe('success');
    expect(state.mistakes).toBe(0);
    expect(effects.at(-1)).toBe('filed');
  });

  it('succeeds when a clean card is filed without circles', () => {
    const card = generateCard(1, story({ truth: 'true' }), stamp('decisive'));
    const [state] = run(initialState(card), [{ type: 'file' }]);
    expect(state.outcome).toBe('success');
  });

  it('counts circling a clean field as a mistake and crosses it out', () => {
    const card = flaggedCard();
    const clean = card.fields.findIndex((f) => !f.flagged);
    const [state, effects] = run(initialState(card), [
      { type: 'toggle', index: clean },
      { type: 'toggle', index: clean },
    ]);
    expect(effects).toEqual(['mistake', 'blocked']);
    expect(state.mistakes).toBe(1);
    expect(state.struck[clean]).toBe(true);
    expect(state.circled[clean]).toBe(false);
    expect(state.outcome).toBe('playing');
  });

  it('counts filing with a missed warning sign as a mistake', () => {
    const card = flaggedCard();
    const [state, effects] = run(initialState(card), [{ type: 'file' }]);
    expect(effects).toEqual(['missing']);
    expect(state.missing).toBe(true);
    expect(state.outcome).toBe('playing');
  });

  it('fails on the second mistake and then ignores input', () => {
    const card = flaggedCard();
    const clean = card.fields.findIndex((f) => !f.flagged);
    const [state, effects] = run(initialState(card), [
      { type: 'file' },
      { type: 'toggle', index: clean },
      { type: 'file' },
    ]);
    expect(effects).toEqual(['missing', 'failed', null]);
    expect(state.outcome).toBe('failure');
  });

  it('lets a circle be taken back without penalty', () => {
    const card = flaggedCard();
    const flagged = card.fields.findIndex((f) => f.flagged);
    const [state, effects] = run(initialState(card), [
      { type: 'toggle', index: flagged },
      { type: 'toggle', index: flagged },
    ]);
    expect(effects).toEqual(['circle', 'uncircle']);
    expect(state.circled[flagged]).toBe(false);
    expect(state.mistakes).toBe(0);
  });

  it('navigates with wrap-around; confirm on the last row files the card', () => {
    const card = generateCard(1, story({ truth: 'true' }), stamp('decisive'));
    const [moved] = run(initialState(card), [{ type: 'move', delta: -1 }]);
    expect(moved.cursor).toBe(card.fields.length);
    const [filed] = run(moved, [{ type: 'confirm' }]);
    expect(filed.outcome).toBe('success');
    const [wrapped] = run(moved, [{ type: 'move', delta: 1 }]);
    expect(wrapped.cursor).toBe(0);
  });

  it('confirm on a field toggles it', () => {
    const card = flaggedCard();
    const flagged = card.fields.findIndex((f) => f.flagged);
    const [state] = run(initialState(card), [
      { type: 'focus', index: flagged },
      { type: 'confirm' },
    ]);
    expect(state.circled[flagged]).toBe(true);
  });
});
