// Keyboard mapping by physical key code, so it works on any layout (incl. Polish programmer's).
import type { MoveVector } from '@redakcja/shared';

export const KEY_BINDINGS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE'],
  work: ['Space'],
  ping: ['KeyQ'],
} as const;

export const GAME_KEYS: ReadonlySet<string> = new Set(Object.values(KEY_BINDINGS).flat());

function any(pressed: ReadonlySet<string>, codes: readonly string[]): boolean {
  return codes.some((code) => pressed.has(code));
}

/** World axes: +x right, +y towards the camera (down the screen). */
export function keysToMove(pressed: ReadonlySet<string>): MoveVector {
  const x = (any(pressed, KEY_BINDINGS.right) ? 1 : 0) - (any(pressed, KEY_BINDINGS.left) ? 1 : 0);
  const y = (any(pressed, KEY_BINDINGS.down) ? 1 : 0) - (any(pressed, KEY_BINDINGS.up) ? 1 : 0);
  return { x, y };
}

export function isWorkHeld(pressed: ReadonlySet<string>): boolean {
  return any(pressed, KEY_BINDINGS.work);
}
