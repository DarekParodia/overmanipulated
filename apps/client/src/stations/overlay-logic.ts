// Pure helpers for the station overlay and the desk sheet: focus movement for keyboard/gamepad
// navigation, stable seeds for stamp drawings and number formatting. Kept free of React so they
// can be unit-tested.
import type { NavIntent } from '../input/ui-nav.ts';

/** Focusable items laid out in rows; each item is an id. Rows may differ in length. */
export type FocusGrid = readonly (readonly string[])[];

/**
 * Moves the focus by one step. Up/down change the row (keeping the column where possible),
 * left/right move within the row. Unknown or missing focus lands on the first item.
 */
export function moveFocus(
  grid: FocusGrid,
  current: string | null,
  intent: NavIntent,
): string | null {
  const rows = grid.filter((row) => row.length > 0);
  const first = rows[0]?.[0] ?? null;
  let row = -1;
  let col = -1;
  rows.forEach((items, r) => {
    const c = current === null ? -1 : items.indexOf(current);
    if (c >= 0) {
      row = r;
      col = c;
    }
  });
  if (row < 0) {
    return first;
  }
  const at = (r: number, c: number) => {
    const items = rows[r] ?? [];
    return items[Math.min(c, items.length - 1)] ?? current;
  };
  switch (intent) {
    case 'up':
      return at(Math.max(0, row - 1), col);
    case 'down':
      return at(Math.min(rows.length - 1, row + 1), col);
    case 'left':
      return at(row, Math.max(0, col - 1));
    case 'right':
      return at(row, col + 1);
    default:
      return current;
  }
}

/** Stable 31-bit seed from a string id (FNV-1a), for seeded stamp rotation and ink. */
export function seedFromId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 0x7fffffff;
}

/** Signed integer with a typographic minus („−5”, „+12”, „0”). */
export function signed(n: number): string {
  if (n > 0) {
    return `+${n}`;
  }
  if (n < 0) {
    return `−${Math.abs(n)}`;
  }
  return '0';
}

/** Whole seconds left, rounded up and never negative (a countdown shows 1 until it hits 0). */
export function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** `m:ss` for countdowns of a minute or more, plain seconds below. */
export function formatCountdown(ms: number): string {
  const total = secondsLeft(ms);
  if (total < 60) {
    return `${total} s`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
