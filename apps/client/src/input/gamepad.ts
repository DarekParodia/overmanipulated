// Gamepad mapping (standard layout). Pure functions over a minimal gamepad shape so they can
// be tested without the Gamepad API.
import type { MoveVector } from '@redakcja/shared';

export const STICK_DEADZONE = 0.2;

/** Standard mapping button indices. */
export const PAD = {
  south: 0, // A / Cross → pick up / put down
  west: 2, // X / Square → work (hold)
  north: 3, // Y / Triangle → ping
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

export type GamepadLike = {
  axes: readonly number[];
  buttons: readonly { pressed: boolean }[];
};

export type PadReading = {
  move: MoveVector;
  interact: boolean;
  work: boolean;
  ping: boolean;
  active: boolean;
};

/**
 * Radial dead zone with rescaling: inside the zone → 0, outside it the magnitude is remapped
 * to start at 0, so small deliberate movements are possible.
 */
export function radialDeadzone(x: number, y: number, deadzone = STICK_DEADZONE): MoveVector {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) {
    return { x: 0, y: 0 };
  }
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

export function readGamepad(pad: GamepadLike): PadReading {
  const pressed = (index: number) => pad.buttons[index]?.pressed ?? false;
  let move = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  const dx = (pressed(PAD.dpadRight) ? 1 : 0) - (pressed(PAD.dpadLeft) ? 1 : 0);
  const dy = (pressed(PAD.dpadDown) ? 1 : 0) - (pressed(PAD.dpadUp) ? 1 : 0);
  if (dx !== 0 || dy !== 0) {
    move = { x: dx, y: dy };
  }
  const interact = pressed(PAD.south);
  const work = pressed(PAD.west);
  const ping = pressed(PAD.north);
  const active = move.x !== 0 || move.y !== 0 || interact || work || ping;
  return { move, interact, work, ping, active };
}
