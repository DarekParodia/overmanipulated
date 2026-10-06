// Floating virtual joystick maths: the stick appears where the thumb lands.
import type { MoveVector } from '@redakcja/shared';

export const JOYSTICK_RADIUS_PX = 56;
export const JOYSTICK_DEADZONE = 0.15;

export function joystickVector(
  origin: { x: number; y: number },
  current: { x: number; y: number },
  radiusPx = JOYSTICK_RADIUS_PX,
  deadzone = JOYSTICK_DEADZONE,
): MoveVector {
  const dx = (current.x - origin.x) / radiusPx;
  const dy = (current.y - origin.y) / radiusPx;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude <= deadzone) {
    return { x: 0, y: 0 };
  }
  const clamped = Math.min(1, magnitude);
  const scaled = (clamped - deadzone) / (1 - deadzone);
  return { x: (dx / magnitude) * scaled, y: (dy / magnitude) * scaled };
}

/** Where to draw the knob: offset from the origin, clamped to the ring. */
export function knobOffset(
  origin: { x: number; y: number },
  current: { x: number; y: number },
  radiusPx = JOYSTICK_RADIUS_PX,
): { x: number; y: number } {
  const dx = current.x - origin.x;
  const dy = current.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radiusPx) {
    return { x: dx, y: dy };
  }
  return { x: (dx / distance) * radiusPx, y: (dy / distance) * radiusPx };
}
