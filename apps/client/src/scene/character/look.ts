// Body turning and head look-at (S5-02). The body turns towards the facing quickly but not
// instantly, and the head leads the turn: it points at where the body is going (or at the
// station being operated) and the body catches up. All angles are rotations about the vertical
// axis in three's convention (`facingToRotationY`), so a head yaw of `d` turns the head by `d`
// relative to the body.
import { facingToRotationY } from '../coords.ts';

/** Rate (1/s) at which the body turns to its facing. */
export const BODY_TURN_RATE = 16;
/** Share of the remaining body turn the head already looks into. */
export const HEAD_LEAD = 0.9;
/** The head never leads further than this (radians). */
export const HEAD_LEAD_MAX = 0.8;
/** Looking at an interaction target: head pitch down towards the table. */
export const LOOK_DOWN = -0.16;
/** Head follows a target within this distance (tiles). */
export const LOOK_RANGE = 3;

export function wrapAngle(angle: number): number {
  let a = (angle + Math.PI) % (2 * Math.PI);
  if (a < 0) {
    a += 2 * Math.PI;
  }
  return a - Math.PI;
}

/** Moves `current` towards `target` along the short way, exponentially. */
export function turnTowards(current: number, target: number, dt: number, rate: number): number {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}

export type LookResult = { yaw: number; pitch: number };

/**
 * Head orientation relative to the body. With an interaction target (tile coordinates) the head
 * turns to it; otherwise it leads the body's current turn.
 */
export function headLook(
  bodyRotationY: number,
  facing: number,
  position: { x: number; y: number },
  target: { x: number; y: number } | null,
  out: LookResult = { yaw: 0, pitch: 0 },
): LookResult {
  if (target) {
    const dx = target.x - position.x;
    const dy = target.y - position.y;
    if (dx * dx + dy * dy > 1e-4 && dx * dx + dy * dy < LOOK_RANGE * LOOK_RANGE) {
      out.yaw = wrapAngle(facingToRotationY(Math.atan2(dy, dx)) - bodyRotationY);
      out.pitch = LOOK_DOWN;
      return out;
    }
  }
  const lead = wrapAngle(facingToRotationY(facing) - bodyRotationY) * HEAD_LEAD;
  out.yaw = Math.max(-HEAD_LEAD_MAX, Math.min(HEAD_LEAD_MAX, lead));
  out.pitch = 0;
  return out;
}
