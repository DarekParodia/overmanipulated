// Where the wall decor hangs (S5-01), derived from any level's tile map: windows and posters on
// the back wall's free columns only (never behind a station or the conveyor, whose floating signs
// cover that part of the wall, nor behind the Ambience wall clock), at most a handful so the
// wall stays calm. Free of three.js and React so it can be unit-tested.
import { type TileMap, tileAt } from '@redakcja/shared';
import { ambienceLayout } from './ambience-layout.ts';
import type { PosterId, Theme } from './theme.ts';

export type DecorSlot =
  | { kind: 'window'; col: number; x: number }
  | { kind: 'poster'; col: number; x: number; poster: PosterId };

export const DECOR_LIMIT = 6;
/** Columns kept clear on both sides of a station: its sign is wider than the tile. */
const SIGN_REACH = 1;

/** Back-wall columns that have nothing in front of them that would hide or clutter decor. */
export function freeWallColumns(map: TileMap, signReach: number = SIGN_REACH): number[] {
  const blocked = new Set<number>();
  for (const fixture of map.fixtures) {
    if (fixture.row > 2) {
      continue;
    }
    const reach = fixture.kind === 'conveyor' ? 0 : signReach;
    for (let c = fixture.col - reach; c <= fixture.col + reach; c++) {
      blocked.add(c);
    }
    if (fixture.kind === 'conveyor') {
      // One sign for the whole belt, over its middle: keep the belt's span clear.
      blocked.add(fixture.col - 1);
    }
  }
  const clock = ambienceLayout(map).clock;
  if (clock) {
    blocked.add(clock.col - 1);
    blocked.add(clock.col);
    blocked.add(clock.col + 1);
  }
  const free: number[] = [];
  for (let col = 1; col < map.width - 1; col++) {
    if (tileAt(map, col, 0) === 'wall' && !blocked.has(col)) {
      free.push(col);
    }
  }
  return free;
}

/**
 * Windows and posters alternate along the free columns (a window first), at most
 * `DECOR_LIMIT`, spread over the runs so one long run doesn't take all of them. Posters follow the
 * theme's list in order.
 */
export function decorSlots(map: TileMap, theme: Theme): DecorSlot[] {
  const roomy = slotsFor(map, theme, SIGN_REACH);
  // Crowded back walls (many stations): squeeze in next to the signs rather than go bare.
  return roomy.length >= MIN_SLOTS ? roomy : slotsFor(map, theme, 0);
}

const MIN_SLOTS = 3;

function slotsFor(map: TileMap, theme: Theme, signReach: number): DecorSlot[] {
  const free = freeWallColumns(map, signReach);
  // Every second free column, so neighbours never touch and the wall keeps breathing room.
  const spaced: number[] = [];
  for (const col of free) {
    if (spaced.length === 0 || col - (spaced[spaced.length - 1] ?? -9) >= 2) {
      spaced.push(col);
    }
  }
  const slots: DecorSlot[] = [];
  const stride = Math.max(1, Math.ceil(spaced.length / DECOR_LIMIT));
  let poster = 0;
  for (let i = 0; i < spaced.length && slots.length < DECOR_LIMIT; i += stride) {
    const col = spaced[i];
    if (col === undefined) {
      continue;
    }
    const x = col + 0.5;
    const pick = theme.posters[poster % theme.posters.length];
    if (slots.length % 2 === 0 || !pick) {
      slots.push({ kind: 'window', col, x });
    } else {
      slots.push({ kind: 'poster', col, x, poster: pick });
      poster++;
    }
  }
  return slots;
}
