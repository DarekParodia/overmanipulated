import { describe, expect, test } from 'bun:test';
import type { Folder } from '@redakcja/shared';
import { type QueueViewInput, queueView } from './queue-model.ts';

function folders(n: number): Folder[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    spawnKey: `s${i}`,
    storyId: 's',
    location: { kind: 'fixture', fixtureId: 'conveyor-0' },
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs: 10_000 * (i + 1),
    warned: false,
  }));
}

/** A 300 px band, 90 px cards, 8 px gaps and a 40 px "+N" chip. */
function view(n: number, patch: Partial<QueueViewInput> = {}) {
  const result = queueView({
    sorted: folders(n),
    widthPx: 300,
    cardPx: 90,
    gapPx: 8,
    chipPx: 40,
    next: false,
    full: false,
    ...patch,
  });
  return { shown: result.shown.map((f) => f.id), hidden: result.hidden, ghost: result.ghost };
}

describe('queue view', () => {
  test('three folders fit a 300 px band', () => {
    expect(view(3)).toEqual({ shown: ['f0', 'f1', 'f2'], hidden: 0, ghost: null });
  });

  test('four folders: two cards and "+2", since three cards and the chip need 334 px', () => {
    expect(view(4)).toEqual({ shown: ['f0', 'f1'], hidden: 2, ghost: null });
  });

  test('a 240 px band holds two cards and "+1" for three folders', () => {
    expect(view(3, { widthPx: 240 })).toEqual({ shown: ['f0', 'f1'], hidden: 1, ghost: null });
  });

  test('two folders and a next one: the ghost card takes the free slot', () => {
    expect(view(2, { next: true })).toEqual({ shown: ['f0', 'f1'], hidden: 0, ghost: 'next' });
  });

  test('a full belt wins over the countdown', () => {
    expect(view(1, { next: true, full: true }).ghost).toBe('full');
    expect(view(0, { full: true })).toEqual({ shown: [], hidden: 0, ghost: 'full' });
  });

  test('no ghost without a free slot, nor when nothing is coming', () => {
    expect(view(3, { next: true }).ghost).toBeNull();
    expect(view(4, { next: true, full: true }).ghost).toBeNull();
    expect(view(2).ghost).toBeNull();
  });

  test('no ghost when the free slot is too narrow for a card', () => {
    // 2 cards fit 190 px; a third card needs 286 px.
    expect(view(2, { widthPx: 190, next: true })).toEqual({
      shown: ['f0', 'f1'],
      hidden: 0,
      ghost: null,
    });
  });

  test('the most urgent folder always shows, even on a band narrower than a card', () => {
    expect(view(3, { widthPx: 60 })).toEqual({ shown: ['f0'], hidden: 2, ghost: null });
    expect(view(0, { widthPx: 60, next: true }).ghost).toBeNull();
  });
});
