// Procedural character animation for the greybox capsules (stage 1–2): walk bob, lean into
// movement, squash & stretch on start/stop, idle breathing. Pure maths; the scene applies it.
import { type SpringState, stepSpring } from './spring.ts';

export type CharacterPose = {
  /** Vertical offset in tiles. */
  bob: number;
  /** Forward lean in radians (applied around the facing-perpendicular axis). */
  lean: number;
  /** Vertical scale; horizontal scale is 1/sqrt(squash) to keep volume. */
  squash: number;
};

export type CharacterAnimator = {
  walkPhase: number;
  wasMoving: boolean;
  lean: SpringState;
  squash: SpringState;
  idleTime: number;
};

export const WALK_CYCLE_HZ = 2.4;
const BOB_HEIGHT = 0.06;
const LEAN_MOVING = 0.16;
const START_SQUASH = 0.82;
const STOP_STRETCH = 1.12;
const BREATH_HZ = 0.35;
const BREATH_AMOUNT = 0.015;
/** Anticipation: a quick lean back (radians) before the first step. */
const START_LEAN_BACK = -0.07;
/** Landing after a hop squashes the body for a moment. */
const LANDING_SQUASH = 0.86;

export function createAnimator(): CharacterAnimator {
  return {
    walkPhase: 0,
    wasMoving: false,
    lean: { value: 0, velocity: 0 },
    squash: { value: 1, velocity: 0 },
    idleTime: 0,
  };
}

/** Squashes the character as it lands from a hop (the spring brings it back). */
export function landingSquash(animator: CharacterAnimator): void {
  animator.squash.value = Math.min(animator.squash.value, LANDING_SQUASH);
  animator.squash.velocity = 0;
}

export type StepEvents = { started: boolean; stopped: boolean; footstep: boolean };

/**
 * Advances the animator and returns the pose plus events (start/stop/footstep) that the scene
 * turns into feedback cues. With `reducedMotion`, bob/lean/squash are disabled.
 */
export function animateCharacter(
  animator: CharacterAnimator,
  moving: boolean,
  dtSeconds: number,
  reducedMotion: boolean,
): { pose: CharacterPose; events: StepEvents } {
  const started = moving && !animator.wasMoving;
  const stopped = !moving && animator.wasMoving;
  animator.wasMoving = moving;

  if (started) {
    animator.squash.value = START_SQUASH;
    animator.squash.velocity = 0;
    animator.lean.value = START_LEAN_BACK;
    animator.lean.velocity = 0;
  } else if (stopped) {
    animator.squash.value = STOP_STRETCH;
    animator.squash.velocity = 0;
  }

  let footstep = false;
  if (moving) {
    const before = animator.walkPhase;
    animator.walkPhase += dtSeconds * WALK_CYCLE_HZ * 2;
    // One footstep per half cycle (each foot).
    footstep = Math.floor(animator.walkPhase) !== Math.floor(before);
    animator.idleTime = 0;
  } else {
    animator.walkPhase = 0;
    animator.idleTime += dtSeconds;
  }

  stepSpring(animator.lean, moving ? LEAN_MOVING : 0, dtSeconds, 4, 0.8);
  stepSpring(animator.squash, 1, dtSeconds, 5, 0.35);

  if (reducedMotion) {
    return { pose: { bob: 0, lean: 0, squash: 1 }, events: { started, stopped, footstep } };
  }

  const bob = moving ? Math.abs(Math.sin(animator.walkPhase * Math.PI)) * BOB_HEIGHT : 0;
  const breath = moving ? 0 : Math.sin(animator.idleTime * Math.PI * 2 * BREATH_HZ) * BREATH_AMOUNT;
  return {
    pose: { bob, lean: animator.lean.value, squash: animator.squash.value + breath },
    events: { started, stopped, footstep },
  };
}
